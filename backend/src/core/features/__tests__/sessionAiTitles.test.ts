import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationGate } from '../../entities/migration/MigrationGate';
import { SessionAiTitleCollection } from '../../entities/session/SessionAiTitle.collection';
import {
  AI_TITLES_READ_DEADLINE_MS,
  displayTitle,
  readSessionAiTitles,
  removeSessionAiTitle,
  writeSessionAiTitle,
} from '../sessionAiTitles';

describe('displayTitle', () => {
  it('lets a rename made here win over everything', () => {
    expect(displayTitle({ title: 'Renamed in CLI', titleSource: 'custom-title' }, 'Mine', 'Generated')).toBe('Mine');
  });

  it('stands in for the first prompt and a summary, as the CLI\'s own title would', () => {
    expect(displayTitle({ title: 'fix the thing pls', titleSource: 'prompt' }, undefined, 'Fix login form')).toBe('Fix login form');
    expect(displayTitle({ title: 'Auto summary', titleSource: 'summary' }, undefined, 'Fix login form')).toBe('Fix login form');
  });

  it('never covers a name Claude Code recorded itself', () => {
    for (const titleSource of ['agent-name', 'custom-title', 'ai-title'] as const) {
      expect(displayTitle({ title: 'From the CLI', titleSource }, undefined, 'Generated')).toBe('From the CLI');
    }
  });

  it('keeps the session\'s own title when nothing else is known', () => {
    expect(displayTitle({ title: 'First prompt', titleSource: 'prompt' })).toBe('First prompt');
  });
});

describe('sessionAiTitles store', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'session-ai-titles-'));
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(async () => {
    vi.useRealTimers();
    MigrationGate.reset();
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    await rm(root, { recursive: true, force: true });
  });

  const stored = async () => Object.fromEntries(await readSessionAiTitles());
  const tableFile = () => new SessionAiTitleCollection().filePath;

  it('reads nothing before anything is written', async () => {
    expect(await stored()).toEqual({});
  });

  it('writes, reads back and removes one session at a time', async () => {
    await writeSessionAiTitle('/p', 's1', 'Fix login form');
    await writeSessionAiTitle('/q', 's2', 'Add dark mode');
    expect(await stored()).toEqual({ s1: 'Fix login form', s2: 'Add dark mode' });

    await removeSessionAiTitle('s1');
    expect(await stored()).toEqual({ s2: 'Add dark mode' });
  });

  it('replaces the title of a session instead of adding a second row', async () => {
    await writeSessionAiTitle('/p', 's1', 'First');
    await writeSessionAiTitle('/p', 's1', 'Second');

    expect(await stored()).toEqual({ s1: 'Second' });
    expect(await new SessionAiTitleCollection().count()).toBe(1);
  });

  it('stores a title as a row of the entity table, pointing at its project by number', async () => {
    await writeSessionAiTitle('/p', 's1', 'Fix login form');

    const [line] = (await readFile(tableFile(), 'utf-8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(line).toMatchObject({ id: 1, sessionId: 's1', title: 'Fix login form', projectId: expect.any(Number) });
  });

  it('refuses to write over a table it cannot read, so the caller never announces a title it lost', async () => {
    await mkdir(tableFile(), { recursive: true });
    await expect(writeSessionAiTitle('/p', 's2', 'New')).rejects.toThrow();
    await expect(removeSessionAiTitle('s2')).resolves.toBeUndefined();
    expect(await stored()).toEqual({});
  });

  it('keeps a line it does not understand when it writes', async () => {
    await mkdir(join(root, 'ccg', 'entities', 'session'), { recursive: true });
    await writeFile(tableFile(), '{ "s1": "Kept", \n');

    await writeSessionAiTitle('/p', 's2', 'New');
    await removeSessionAiTitle('s2');

    expect(await readFile(tableFile(), 'utf-8')).toContain('{ "s1": "Kept", ');
  });

  it('answers without titles instead of holding a list back while migrations run', async () => {
    vi.useFakeTimers();
    MigrationGate.close(new Promise(() => {}));

    const read = readSessionAiTitles();
    await vi.advanceTimersByTimeAsync(AI_TITLES_READ_DEADLINE_MS);

    expect(await read).toEqual(new Map());
  });
});
