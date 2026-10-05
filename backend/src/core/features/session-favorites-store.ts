import { EntityChange } from '../entities/AbstractEntityCollection';
import { ProjectCollection } from '../entities/project/Project.collection';
import { SessionFavoriteCollection } from '../entities/session/SessionFavorite.collection';
import { SessionFavorite } from '../entities/session/SessionFavorite.entity';

/**
 * Sessions the user starred, so they stay at the top of the session list.
 *
 * Rows live in the `session_favorites` entity table (see core/entities). A
 * user decision ABOUT sessions, kept apart from the sessions themselves (which
 * belong to the CLI under ~/.claude/projects), the same split the `projects`
 * table makes for pinned projects. Each star points at the project its session
 * runs in, because the session list is paged: a starred session from months ago
 * is usually not in the page the list holds, and the project's directory is what
 * lets its row be built on its own.
 *
 * Stars used to live in `~/.claude-code-gui/session-favorites.json`; the
 * `import-legacy-session-favorites` migration moved them here and left the old
 * file as it was.
 *
 * Everything this module hands out is the WIRE shape the webview has always
 * been given (`{ sessionId, sessionDir }`); the row numbers never leave the
 * backend.
 */

/**
 * One starred session, in the shape the webview receives.
 *
 * A class and not a bare shape: the app never holds a star as a plain object,
 * and the webview gets it through `toJSON`.
 */
export class FavoriteSession {
  constructor(
    readonly sessionId: string,
    /** The directory the session runs in, or '' when it was never known. */
    readonly sessionDir: string,
  ) {}

  toJSON(): { sessionId: string; sessionDir: string } {
    return { sessionId: this.sessionId, sessionDir: this.sessionDir };
  }
}

/**
 * The stored stars, newest first, or none when they cannot be read. Only ever
 * displayed, so an empty list is the safe failure; the write path below never
 * reuses this fallback.
 */
export async function readSessionFavorites(): Promise<FavoriteSession[]> {
  try {
    const [stars, projects] = await Promise.all([
      new SessionFavoriteCollection().newestFirst(),
      new ProjectCollection().all(),
    ]);
    const pathById = new Map(projects.map((project) => [project.id, project.path]));
    return stars.map(
      (star) => new FavoriteSession(star.sessionId, star.projectId === null ? '' : pathById.get(star.projectId) ?? ''),
    );
  } catch (err) {
    console.error('[node-backend]', 'could not read the starred sessions:', err instanceof Error ? err.message : err);
    return [];
  }
}

export interface SetSessionFavoriteResult {
  ok: boolean;
  favorites: FavoriteSession[];
}

/**
 * Star or unstar one session, reporting the list as it now stands.
 *
 * Starring a session that is already starred only moves the star to the
 * directory given, when one is given and differs. A failed write answers
 * `ok: false` with the list as it is on disk, so the webview can take back the
 * star it drew early.
 */
export async function setSessionFavorite(
  sessionId: string,
  sessionDir: string,
  favorite: boolean,
): Promise<SetSessionFavoriteResult> {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { ok: true, favorites: await readSessionFavorites() };
  }

  try {
    const stars = new SessionFavoriteCollection();
    if (favorite) {
      const projectId = sessionDir ? await new ProjectCollection().idOf(sessionDir) : null;
      const present = await stars.mutate((rows) => {
        const row = rows.find((candidate) => candidate.sessionId === sessionId);
        if (!row) return EntityChange.keep(rows, false);
        if (projectId === null || row.projectId === projectId) return EntityChange.keep(rows, true);
        row.projectId = projectId;
        row.favoritedAt = Date.now();
        return EntityChange.write(rows, true);
      });
      if (!present) {
        await stars.insertMissing(
          [SessionFavorite.draft(projectId, sessionId, Date.now())],
          (stored, candidate) => stored.sessionId === candidate.sessionId,
        );
      }
    } else {
      await stars.mutate((rows) => {
        const kept = rows.filter((row) => row.sessionId !== sessionId);
        return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
      });
    }
  } catch (err) {
    console.error('[node-backend]', `could not ${favorite ? 'star' : 'unstar'} session ${sessionId}:`, err instanceof Error ? err.message : err);
    return { ok: false, favorites: await readSessionFavorites() };
  }
  return { ok: true, favorites: await readSessionFavorites() };
}
