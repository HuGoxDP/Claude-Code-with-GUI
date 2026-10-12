import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let chain: Record<string, unknown>[] = [];
vi.mock('../loadSessionMessages', () => ({
  loadActiveChain: vi.fn(async () => chain),
}));

import {
  applyEdit,
  collectFileHistories,
  getSessionFileChanges,
  getSessionFileDiff,
  lineStats,
  revertSessionFileChanges,
} from '../session-file-changes';

let n = 0;
function toolCall(name: string, input: Record<string, unknown>, result: Record<string, unknown> | string, opts: { isError?: boolean; at?: string } = {}) {
  const id = `toolu_${++n}`;
  return [
    { type: 'assistant', uuid: `a${n}`, message: { content: [{ type: 'tool_use', id, name, input }] } },
    {
      type: 'user',
      uuid: `u${n}`,
      timestamp: opts.at ?? `2026-10-12T10:00:${String(n).padStart(2, '0')}.000Z`,
      message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: opts.isError === true, content: 'ok' }] },
      toolUseResult: result,
    },
  ];
}

describe('applyEdit', () => {
  it('replaces the first occurrence, or every one with replaceAll', () => {
    expect(applyEdit('a b a', 'a', 'x', false)).toBe('x b a');
    expect(applyEdit('a b a', 'a', 'x', true)).toBe('x b x');
    expect(applyEdit('abc', 'zz', 'x', false)).toBeUndefined();
  });
});

describe('lineStats', () => {
  it('counts the lines added and removed', () => {
    expect(lineStats('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual({ additions: 2, deletions: 1 });
    expect(lineStats('', 'one\ntwo')).toEqual({ additions: 2, deletions: 0 });
    expect(lineStats('same', 'same')).toEqual({ additions: 0, deletions: 0 });
  });
});

describe('collectFileHistories', () => {
  beforeEach(() => {
    n = 0;
  });

  it('keeps the file before the first edit and works out what the last one left', () => {
    const edits = [
      ...toolCall('Edit', { file_path: '/p/a.txt' }, { filePath: '/p/a.txt', originalFile: 'x = 1\n', oldString: '1', newString: '2', replaceAll: false }),
      ...toolCall('MultiEdit', { file_path: '/p/a.txt' }, {
        filePath: '/p/a.txt',
        originalFile: 'x = 2\n',
        edits: [{ old_string: 'x', new_string: 'y' }, { old_string: '2', new_string: '3' }],
      }),
      ...toolCall('Write', { file_path: '/p/new.txt', content: 'hi\n' }, { type: 'create', filePath: '/p/new.txt', content: 'hi\n', originalFile: null }),
    ];
    const [a, created] = collectFileHistories(edits);
    expect(a).toMatchObject({ filePath: '/p/a.txt', baseline: 'x = 1\n', expected: 'y = 3\n', edits: 2 });
    expect(created).toMatchObject({ filePath: '/p/new.txt', baseline: null, expected: 'hi\n', edits: 1 });
  });

  it('skips failed calls, other tools, relative paths, and edits before `since`', () => {
    const edits = [
      ...toolCall('Edit', { file_path: '/p/a.txt' }, 'Error: String not found', { isError: true }),
      ...toolCall('Read', { file_path: '/p/a.txt' }, { type: 'text', file: { filePath: '/p/a.txt' } }),
      ...toolCall('Write', { file_path: 'rel.txt' }, { type: 'create', filePath: 'rel.txt', content: 'x' }),
      ...toolCall('Write', { file_path: '/p/b.txt' }, { type: 'update', filePath: '/p/b.txt', content: 'v1', originalFile: 'v0' }, { at: '2026-10-12T09:00:00.000Z' }),
      ...toolCall('Write', { file_path: '/p/b.txt' }, { type: 'update', filePath: '/p/b.txt', content: 'v2', originalFile: 'v1' }, { at: '2026-10-12T11:00:00.000Z' }),
    ];
    expect(collectFileHistories(edits).map((h) => [h.filePath, h.baseline, h.expected])).toEqual([['/p/b.txt', 'v0', 'v2']]);
    expect(collectFileHistories(edits, '2026-10-12T10:00:00.000Z').map((h) => [h.filePath, h.baseline])).toEqual([['/p/b.txt', 'v1']]);
  });

  it('cannot put back a file whose earlier text is not recorded', () => {
    const [h] = collectFileHistories(toolCall('Edit', { file_path: '/p/a.txt' }, { filePath: '/p/a.txt', oldString: 'a', newString: 'b' }));
    expect(h.baseline).toBeUndefined();
    expect(h.expected).toBeUndefined();
  });
});

describe('on disk', () => {
  let dir: string;
  beforeEach(async () => {
    n = 0;
    dir = await mkdtemp(join(tmpdir(), 'file-changes-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function session() {
    const edited = join(dir, 'config.toml');
    const created = join(dir, 'notes.md');
    await writeFile(edited, 'retries = 5\ntimeout = 30\n');
    await writeFile(created, '# Notes\n');
    chain = [
      ...toolCall('Edit', { file_path: edited }, { filePath: edited, originalFile: 'retries = 3\ntimeout = 30\n', oldString: 'retries = 3', newString: 'retries = 5' }),
      ...toolCall('Write', { file_path: created }, { type: 'create', filePath: created, content: '# Notes\n', originalFile: null }),
    ];
    return { edited, created };
  }

  it('lists the files that still differ, newest first, with line counts', async () => {
    const { edited, created } = await session();
    const files = await getSessionFileChanges(dir, 's1');
    expect(files.map((f) => [f.filePath, f.status, f.additions, f.deletions, f.changedSince, f.revertable])).toEqual([
      [created, 'added', 1, 0, false, true],
      [edited, 'modified', 1, 1, false, true],
    ]);
  });

  it('drops a file that is back to how it was', async () => {
    const { edited } = await session();
    await writeFile(edited, 'retries = 3\ntimeout = 30\n');
    expect((await getSessionFileChanges(dir, 's1')).map((f) => f.filePath)).not.toContain(edited);
  });

  it('says when a file changed after Claude, and only reverts it when forced', async () => {
    const { edited } = await session();
    await writeFile(edited, 'retries = 5\ntimeout = 99\n');
    expect((await getSessionFileChanges(dir, 's1')).find((f) => f.filePath === edited)?.changedSince).toBe(true);

    expect(await revertSessionFileChanges(dir, 's1', [edited])).toEqual([{ filePath: edited, ok: false, reason: 'changed-since' }]);
    expect(await readFile(edited, 'utf-8')).toBe('retries = 5\ntimeout = 99\n');

    expect(await revertSessionFileChanges(dir, 's1', [edited], { force: true })).toEqual([{ filePath: edited, ok: true }]);
    expect(await readFile(edited, 'utf-8')).toBe('retries = 3\ntimeout = 30\n');
  });

  it('puts edited files back and removes created ones', async () => {
    const { edited, created } = await session();
    const outcomes = await revertSessionFileChanges(dir, 's1', [edited, created]);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(await readFile(edited, 'utf-8')).toBe('retries = 3\ntimeout = 30\n');
    expect(existsSync(created)).toBe(false);
    expect(await getSessionFileChanges(dir, 's1')).toEqual([]);
  });

  it('refuses files the session did not change', async () => {
    await session();
    const other = join(dir, 'other.txt');
    await writeFile(other, 'mine');
    expect(await revertSessionFileChanges(dir, 's1', [other])).toEqual([{ filePath: other, ok: false, reason: 'not-changed' }]);
    expect(await readFile(other, 'utf-8')).toBe('mine');
  });

  it('gives the diff of a changed file', async () => {
    const { edited } = await session();
    expect(await getSessionFileDiff(dir, 's1', edited)).toEqual({
      before: 'retries = 3\ntimeout = 30\n',
      after: 'retries = 5\ntimeout = 30\n',
      tooLarge: false,
    });
    expect(await getSessionFileDiff(dir, 's1', join(dir, 'nope'))).toBeNull();
  });
});
