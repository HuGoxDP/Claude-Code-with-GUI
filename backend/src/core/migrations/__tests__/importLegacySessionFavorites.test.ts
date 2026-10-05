import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationContext } from '../../entities/migration/Migration';
import { SessionFavoriteCollection } from '../../entities/session/SessionFavorite.collection';
import { SessionFavorite } from '../../entities/session/SessionFavorite.entity';
import { readSessionFavorites } from '../../features/session-favorites-store';
import ImportLegacySessionFavorites from '../20261005120000_import-legacy-session-favorites';

describe('importing the old starred sessions file', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;
  let userHome: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-import-session-favorites-')));
    userHome = join(root, 'home');
    mkdirSync(join(userHome, '.claude-code-gui'), { recursive: true });
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  const legacyFolder = () => join(userHome, '.claude-code-gui');
  const legacyFile = () => join(legacyFolder(), 'session-favorites.json');
  const plant = (content: unknown) =>
    writeFileSync(legacyFile(), typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
  const workdir = (name: string) => {
    const path = join(root, 'work', name);
    mkdirSync(path, { recursive: true });
    return path;
  };
  const context = () => new MigrationContext(userHome);
  const run = () => new ImportLegacySessionFavorites().up(context());
  const hash = () => createHash('sha256').update(readFileSync(legacyFile())).digest('hex');
  const listed = async () => JSON.parse(JSON.stringify(await readSessionFavorites()));

  it('does nothing when there is no old file', async () => {
    const report = await run();

    expect(report.summary).toBe('no old data to move');
    expect(await new SessionFavoriteCollection().all()).toEqual([]);
  });

  it('moves the stars in the order the list showed them, each with its directory', async () => {
    const [a, b] = [workdir('a'), workdir('b')];
    plant({ favorites: [{ sessionId: 's2', sessionDir: b }, { sessionId: 's1', sessionDir: a }] });

    const report = await run();

    expect(report.summary).toBe('moved 2 starred sessions');
    expect(await listed()).toEqual([
      { sessionId: 's2', sessionDir: b },
      { sessionId: 's1', sessionDir: a },
    ]);
  });

  it('keeps a star whose directory the file did not name', async () => {
    plant({ favorites: [{ sessionId: 's1' }] });

    await run();

    expect(await listed()).toEqual([{ sessionId: 's1', sessionDir: '' }]);
  });

  it('drops what is not a star, and a session listed twice', async () => {
    const a = workdir('a');
    plant({ favorites: [{ sessionId: 's1', sessionDir: a }, { sessionId: 's1', sessionDir: '/elsewhere' }, { sessionId: '' }, 'junk', null] });

    await run();

    expect(await listed()).toEqual([{ sessionId: 's1', sessionDir: a }]);
  });

  it('leaves the old file exactly as it was', async () => {
    plant({ favorites: [{ sessionId: 's1', sessionDir: workdir('a') }], other: 'kept' });
    const before = hash();

    await run();

    expect(hash()).toBe(before);
  });

  it('adds no row twice when it runs again', async () => {
    plant({ favorites: [{ sessionId: 's1', sessionDir: workdir('a') }] });
    await run();
    const before = await new SessionFavoriteCollection().all();

    await run();

    expect(await new SessionFavoriteCollection().all()).toEqual(before);
  });

  it('moves only what is missing after a run that was cut off half way', async () => {
    const a = workdir('a');
    plant({ favorites: [{ sessionId: 's2', sessionDir: a }, { sessionId: 's1', sessionDir: a }] });
    // The first star had been written when the process ended.
    await new SessionFavoriteCollection().insert(SessionFavorite.draft(null, 's2', 7));

    await run();

    expect((await new SessionFavoriteCollection().all()).map((star) => star.sessionId).sort()).toEqual(['s1', 's2']);
  });

  it('reports a file that is not JSON and moves nothing from it', async () => {
    plant('{ not json');

    const report = await run();

    expect(report.unreadable).toEqual([legacyFolder()]);
    expect(await new SessionFavoriteCollection().all()).toEqual([]);
  });

  it('refuses to write over an entity file it cannot read', async () => {
    plant({ favorites: [{ sessionId: 's1' }] });
    mkdirSync(join(root, 'ccg', 'entities', 'session', 'session_favorites.entity.jsonl'), { recursive: true });

    await expect(run()).rejects.toThrow();
  });

  describe('reading the folder again', () => {
    const retry = (folders: string[]) => new ImportLegacySessionFavorites().retry(context(), folders);

    it('moves the stars once the file reads, below the ones made meanwhile', async () => {
      const a = workdir('a');
      plant({ favorites: [{ sessionId: 'old', sessionDir: a }] });
      await new SessionFavoriteCollection().insert(SessionFavorite.draft(null, 'new', Date.now()));

      expect(await retry([legacyFolder()])).toEqual([]);

      expect((await listed()).map((star: { sessionId: string }) => star.sessionId)).toEqual(['new', 'old']);
    });

    it('answers the folder while the file still cannot be read', async () => {
      plant('{ not json');

      expect(await retry([legacyFolder()])).toEqual([legacyFolder()]);
    });

    it('lets go of the folder once the file is gone', async () => {
      expect(await retry([legacyFolder()])).toEqual([]);
    });

    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a file it has no permission to read', async () => {
      plant({ favorites: [{ sessionId: 's1' }] });
      chmodSync(legacyFile(), 0o000);
      try {
        expect((await run()).unreadable).toEqual([legacyFolder()]);
      } finally {
        chmodSync(legacyFile(), 0o600);
      }
    });
  });
});
