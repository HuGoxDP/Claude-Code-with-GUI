import { readFile } from 'fs/promises';
import { join } from 'path';
import { ImportCounts, LegacyImport } from '../entities/migration/LegacyImport';
import { MigrationContext } from '../entities/migration/Migration';
import { SessionFavoriteCollection } from '../entities/session/SessionFavorite.collection';
import { SessionFavorite } from '../entities/session/SessionFavorite.entity';

/**
 * Moves the starred sessions out of the old
 * `~/.claude-code-gui/session-favorites.json` into the `session_favorites` table.
 *
 * The old file is READ and never written, renamed or deleted. It listed the stars
 * newest first, and the order is kept by giving the first star the latest time.
 * Each star names the directory its session runs in; that directory becomes the
 * star's project, registered if the table does not hold it yet. A star the table
 * already has is left as it is, so running this again changes nothing.
 *
 * A file that cannot be read is reported, and read again later by
 * {@link ImportLegacySessionFavorites.retry}: the stars are the user's own
 * decisions, and nothing else would bring them back.
 */

const LEGACY_DIR_NAME = '.claude-code-gui';
const LEGACY_FILE_NAME = 'session-favorites.json';

/** One star as the old file held it. */
class LegacyStar {
  constructor(
    readonly sessionId: string,
    /** The directory the session runs in, or '' when the file did not say. */
    readonly sessionDir: string,
  ) {}
}

class LegacyStars {
  constructor(
    /** Newest first, as the old file listed them. */
    readonly stars: LegacyStar[],
    /** Directories whose file could not be read. */
    readonly unreadable: string[],
  ) {}
}

/** The usable stars of the old file, each session once (the first one wins). */
export function readLegacyStars(value: unknown): LegacyStar[] {
  if (!Array.isArray(value)) return [];
  const stars: LegacyStar[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { sessionId, sessionDir } = raw as Record<string, unknown>;
    if (typeof sessionId !== 'string' || sessionId.length === 0) continue;
    if (stars.some((known) => known.sessionId === sessionId)) continue;
    stars.push(new LegacyStar(sessionId, typeof sessionDir === 'string' ? sessionDir : ''));
  }
  return stars;
}

/** What reading the old file found: the stars, nothing, or a file that cannot be read. */
async function readLegacyFile(filePath: string): Promise<LegacyStar[] | 'absent' | 'unreadable'> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'absent';
    console.error('[node-backend]', `could not read ${filePath}:`, err instanceof Error ? err.message : err);
    return 'unreadable';
  }
  if (raw.trim() === '') return 'absent';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[node-backend]', `${filePath} is not JSON:`, err instanceof Error ? err.message : err);
    return 'unreadable';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'unreadable';
  return readLegacyStars((parsed as Record<string, unknown>).favorites);
}

export default class ImportLegacySessionFavorites extends LegacyImport<LegacyStars> {
  protected async read(context: MigrationContext): Promise<LegacyStars | null> {
    const folder = join(context.legacyHome, LEGACY_DIR_NAME);
    const old = await readLegacyFile(join(folder, LEGACY_FILE_NAME));
    if (old === 'absent') return null;
    if (old === 'unreadable') return new LegacyStars([], [folder]);
    return new LegacyStars(old, []);
  }

  protected async write(context: MigrationContext, source: LegacyStars): Promise<ImportCounts> {
    const skipped = await this.moveStars(context, source.stars, Date.now());
    return new ImportCounts(new Map([['starred sessions', source.stars.length]]), skipped, source.unreadable);
  }

  protected async verify(_context: MigrationContext, source: LegacyStars): Promise<void> {
    const stored = new Set((await new SessionFavoriteCollection().all()).map((star) => star.sessionId));
    const missing = source.stars.filter((star) => !stored.has(star.sessionId));
    if (missing.length > 0) throw new Error(`${missing.length} starred sessions are missing after the move`);
  }

  /**
   * Read the old file again once it could not be read. Stars the user made since
   * stay above the moved ones, which are given times before the earliest of them.
   */
  async retry(context: MigrationContext, folders: string[]): Promise<string[]> {
    const folder = join(context.legacyHome, LEGACY_DIR_NAME);
    if (!folders.includes(folder)) return [];

    const old = await readLegacyFile(join(folder, LEGACY_FILE_NAME));
    if (old === 'unreadable') return [folder];
    if (old === 'absent') return [];

    const existing = await new SessionFavoriteCollection().all();
    const earliest = existing.reduce((lowest, star) => Math.min(lowest, star.favoritedAt), Date.now());
    await this.moveStars(context, old, earliest - 1);
    await this.verify(context, new LegacyStars(old, []));
    return [];
  }

  /**
   * Add the stars the table does not hold yet, the first at [newestAt] and each
   * next one a millisecond earlier, so the old order survives. Answers how many
   * directories could not be made projects (their stars are kept without one).
   */
  private async moveStars(context: MigrationContext, stars: LegacyStar[], newestAt: number): Promise<number> {
    let skipped = 0;
    const drafts: SessionFavorite[] = [];
    // Strictly after each other, so the projects are registered in the file's order.
    for (const [index, star] of stars.entries()) {
      let projectId: number | null = null;
      if (star.sessionDir) {
        try {
          projectId = await context.projects.idOf(star.sessionDir);
        } catch (err) {
          // A directory that cannot be a project here still leaves the star: it
          // shows wherever its session is listed, it only cannot be fetched alone.
          console.error('[node-backend]', `could not register ${star.sessionDir}:`, err instanceof Error ? err.message : err);
          skipped += 1;
        }
      }
      drafts.push(SessionFavorite.draft(projectId, star.sessionId, newestAt - index));
    }
    await new SessionFavoriteCollection().insertMissing(drafts, (stored, candidate) => stored.sessionId === candidate.sessionId);
    return skipped;
  }
}
