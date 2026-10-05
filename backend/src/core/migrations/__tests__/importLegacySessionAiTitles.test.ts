import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationContext } from '../../entities/migration/Migration';
import { SessionAiTitleCollection } from '../../entities/session/SessionAiTitle.collection';
import { SessionAiTitle } from '../../entities/session/SessionAiTitle.entity';
import { getProjectSessionsPath } from '../../features/getProjectSessionsPath';
import ImportLegacySessionAiTitles from '../20261005120100_import-legacy-session-ai-titles';

describe('importing the old generated session titles', () => {
  const originalCcgHome = process.env.CCG_HOME;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-import-session-titles-')));
    process.env.CCG_HOME = join(root, 'ccg');
    process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
  });

  afterEach(() => {
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    rmSync(root, { recursive: true, force: true });
  });

  const workdir = (name: string) => {
    const path = join(root, 'work', name);
    mkdirSync(path, { recursive: true });
    return path;
  };
  /** The old file of the project at [dir], where the old version kept it. */
  const legacyFileOf = async (dir: string) => join(await getProjectSessionsPath(dir), '.claude-code-gui-ai-titles.json');
  const plant = async (dir: string, content: unknown) => {
    const file = await legacyFileOf(dir);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
    return file;
  };
  const context = () => new MigrationContext(join(root, 'home'));
  const run = () => new ImportLegacySessionAiTitles().up(context());
  const stored = async () =>
    Object.fromEntries((await new SessionAiTitleCollection().all()).map((row) => [row.sessionId, row.title]));

  it('does nothing when there is no sessions folder or no old file', async () => {
    expect((await run()).summary).toBe('no old data to move');
    mkdirSync(join(root, 'claude', 'projects', 'some-project'), { recursive: true });
    expect((await run()).summary).toBe('no old data to move');
  });

  it('moves the titles of every sessions folder, each under its project', async () => {
    const [a, b] = [workdir('a'), workdir('b')];
    const projects = context().projects;
    const [idA, idB] = [await projects.idOf(a), await projects.idOf(b)];
    await plant(a, { s1: 'Fix login form', s2: 'Add dark mode' });
    await plant(b, { s3: 'Speed up tests' });

    const report = await run();

    expect(report.summary).toBe('moved 3 session titles');
    expect(await stored()).toEqual({ s1: 'Fix login form', s2: 'Add dark mode', s3: 'Speed up tests' });
    const rows = await new SessionAiTitleCollection().all();
    expect(rows.find((row) => row.sessionId === 's1')?.projectId).toBe(idA);
    expect(rows.find((row) => row.sessionId === 's3')?.projectId).toBe(idB);
  });

  it('moves the titles of a folder no project encodes to, without a project', async () => {
    const folder = join(root, 'claude', 'projects', '-gone-project');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, '.claude-code-gui-ai-titles.json'), JSON.stringify({ s1: 'Old work' }));

    await run();

    const [row] = await new SessionAiTitleCollection().all();
    expect(row).toMatchObject({ sessionId: 's1', title: 'Old work', projectId: null });
  });

  it('drops what is not a title', async () => {
    await plant(workdir('a'), { s1: 'Kept', s2: '   ', s3: 7, '': 'no id' });

    await run();

    expect(await stored()).toEqual({ s1: 'Kept' });
  });

  it('skips a file that is not a map of titles, counts it, and moves the others', async () => {
    await plant(workdir('a'), '{ not json');
    await plant(workdir('b'), ['a list']);
    await plant(workdir('c'), { s1: 'Kept' });

    const report = await run();

    expect(report.summary).toBe('moved 1 session titles; skipped 2 unreadable rows');
    expect(report.unreadable).toEqual([]);
    expect(await stored()).toEqual({ s1: 'Kept' });
  });

  it('leaves the old files exactly as they were', async () => {
    const file = await plant(workdir('a'), { s1: 'Fix login form' });
    const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
    const before = hash();

    await run();

    expect(hash()).toBe(before);
  });

  it('adds no row twice when it runs again', async () => {
    await plant(workdir('a'), { s1: 'Fix login form' });
    await run();
    const before = await new SessionAiTitleCollection().all();

    await run();

    expect(await new SessionAiTitleCollection().all()).toEqual(before);
  });

  it('moves only what is missing after a run that was cut off half way, and keeps a title stored since', async () => {
    await plant(workdir('a'), { s1: 'From the file', s2: 'Also from the file' });
    // The first title had been written, and then generated again, when the process ended.
    await new SessionAiTitleCollection().insert(SessionAiTitle.draft(null, 's1', 'Stored since', 1));

    await run();

    expect(await stored()).toEqual({ s1: 'Stored since', s2: 'Also from the file' });
  });

  it('refuses to write over an entity file it cannot read', async () => {
    await plant(workdir('a'), { s1: 'Fix login form' });
    mkdirSync(join(root, 'ccg', 'entities', 'session', 'session_ai_titles.entity.jsonl'), { recursive: true });

    await expect(run()).rejects.toThrow();
  });
});
