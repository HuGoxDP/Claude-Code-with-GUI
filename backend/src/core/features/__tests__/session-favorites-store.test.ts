import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionFavoriteCollection } from '../../entities/session/SessionFavorite.collection';
import { readSessionFavorites, setSessionFavorite } from '../session-favorites-store';

describe('session-favorites-store', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-session-favorites-')));
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  const workdir = (name: string) => {
    const path = join(root, 'work', name);
    mkdirSync(path, { recursive: true });
    return path;
  };
  const plain = async () => JSON.parse(JSON.stringify(await readSessionFavorites()));
  const tableFile = () => new SessionFavoriteCollection().filePath;

  it('has no stars before anything is written', async () => {
    expect(await readSessionFavorites()).toEqual([]);
  });

  it('stars newest first and remembers the session directory', async () => {
    const [p, sub] = [workdir('p'), workdir('p/sub')];
    await setSessionFavorite('s1', p, true);
    const { ok, favorites } = await setSessionFavorite('s2', sub, true);

    expect(ok).toBe(true);
    expect(JSON.parse(JSON.stringify(favorites))).toEqual([
      { sessionId: 's2', sessionDir: sub },
      { sessionId: 's1', sessionDir: p },
    ]);
    expect(await plain()).toEqual(JSON.parse(JSON.stringify(favorites)));
  });

  it('stores a star as a row of the entity table, pointing at its project by number', async () => {
    await setSessionFavorite('s1', workdir('p'), true);

    const lines = readFileSync(tableFile(), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: 1, sessionId: 's1', projectId: expect.any(Number) });
    expect(lines[0]).not.toHaveProperty('sessionDir');
  });

  it('unstars, and treats repeating the current state as a no-op', async () => {
    const p = workdir('p');
    await setSessionFavorite('s1', p, true);
    expect((await setSessionFavorite('s1', p, true)).favorites).toHaveLength(1);
    expect((await setSessionFavorite('s1', '', false)).favorites).toEqual([]);
    expect((await setSessionFavorite('s1', '', false)).ok).toBe(true);
  });

  it('moves a star to the directory given when it differs, and keeps it when none is given', async () => {
    const [a, b] = [workdir('a'), workdir('b')];
    await setSessionFavorite('s1', a, true);
    await setSessionFavorite('s1', '', true);
    expect(await plain()).toEqual([{ sessionId: 's1', sessionDir: a }]);

    await setSessionFavorite('s1', b, true);
    expect(await plain()).toEqual([{ sessionId: 's1', sessionDir: b }]);
  });

  it('keeps a star whose directory was never known, with an empty directory', async () => {
    await setSessionFavorite('s1', '', true);
    expect(await plain()).toEqual([{ sessionId: 's1', sessionDir: '' }]);
  });

  it('refuses to write over a table it cannot read, and leaves the file alone', async () => {
    mkdirSync(join(root, 'ccg', 'entities', 'session', 'session_favorites.entity.jsonl'), { recursive: true });

    const result = await setSessionFavorite('s1', workdir('p'), true);

    expect(result.ok).toBe(false);
    expect(result.favorites).toEqual([]);
  });

  it('keeps a line it does not understand when it writes', async () => {
    mkdirSync(join(root, 'ccg', 'entities', 'session'), { recursive: true });
    writeFileSync(tableFile(), '{ not json\n');

    await setSessionFavorite('s1', workdir('p'), true);
    await setSessionFavorite('s1', '', false);

    expect(readFileSync(tableFile(), 'utf-8')).toContain('{ not json');
  });
});
