import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Same isolation as projects-store: point homedir() at a scratch directory and
// exercise the real atomic write.
const home = mkdtempSync(join(tmpdir(), 'ccg-session-favorites-'));
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => process.env.CCG_TEST_HOME ?? actual.homedir() };
});

import {
  normalizeSessionFavorites,
  readSessionFavorites,
  setSessionFavorite,
} from '../session-favorites-store';

const storeFile = join(home, '.claude-code-gui', 'session-favorites.json');

function writeStore(contents: string): void {
  mkdirSync(join(home, '.claude-code-gui'), { recursive: true });
  writeFileSync(storeFile, contents);
}

describe('session-favorites-store', () => {
  beforeEach(() => {
    process.env.CCG_TEST_HOME = home;
    rmSync(join(home, '.claude-code-gui'), { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.CCG_TEST_HOME;
  });

  it('has no stars before anything is written', async () => {
    expect(await readSessionFavorites()).toEqual([]);
  });

  it('stars newest first and remembers the session directory', async () => {
    await setSessionFavorite('s1', '/p', true);
    const { ok, favorites } = await setSessionFavorite('s2', '/p/sub', true);
    expect(ok).toBe(true);
    expect(favorites).toEqual([
      { sessionId: 's2', sessionDir: '/p/sub' },
      { sessionId: 's1', sessionDir: '/p' },
    ]);
    expect(JSON.parse(readFileSync(storeFile, 'utf-8')).favorites).toEqual(favorites);
  });

  it('unstars, and treats repeating the current state as a no-op', async () => {
    await setSessionFavorite('s1', '/p', true);
    expect((await setSessionFavorite('s1', '/p', true)).favorites).toHaveLength(1);
    expect((await setSessionFavorite('s1', '', false)).favorites).toEqual([]);
    expect((await setSessionFavorite('s1', '', false)).ok).toBe(true);
  });

  it('keeps keys it does not know about', async () => {
    writeStore(JSON.stringify({ favorites: [], futureKey: 42 }));
    await setSessionFavorite('s1', '/p', true);
    expect(JSON.parse(readFileSync(storeFile, 'utf-8')).futureKey).toBe(42);
  });

  it('refuses to overwrite a file it cannot read', async () => {
    writeStore('{ not json');
    const result = await setSessionFavorite('s1', '/p', true);
    expect(result.ok).toBe(false);
    expect(readFileSync(storeFile, 'utf-8')).toBe('{ not json');
  });

  it('drops malformed and duplicate entries', () => {
    expect(normalizeSessionFavorites([
      { sessionId: 'a', sessionDir: '/x' },
      { sessionId: 'a', sessionDir: '/y' },
      { sessionId: '' },
      'nope',
      { sessionId: 'b' },
    ])).toEqual([
      { sessionId: 'a', sessionDir: '/x' },
      { sessionId: 'b', sessionDir: '' },
    ]);
    expect(normalizeSessionFavorites(null)).toEqual([]);
  });
});
