import { join } from 'path';
import { homedir } from 'os';
import { readJsonForUpdate, updateJsonFile } from './atomic-json';

/**
 * Sessions the user starred, so they stay at the top of the session list.
 *
 *   ~/.claude-code-gui/session-favorites.json
 *     { "favorites": [{ "sessionId": "…", "sessionDir": "/Users/me/app" }] }
 *
 * A user decision ABOUT sessions, kept apart from the sessions themselves (which
 * belong to the CLI under ~/.claude/projects) — the same split projects.json
 * makes for pinned projects. Each star remembers the directory its session lives
 * in, because the session list is paged: a starred session from months ago is
 * usually not in the page the list holds, and the directory is what lets its
 * row be built on its own.
 *
 * A missing or damaged file costs the stars, never a session.
 */

export interface SessionFavorite {
  sessionId: string;
  sessionDir: string;
}

function storePath(): string {
  return join(homedir(), '.claude-code-gui', 'session-favorites.json');
}

/** Drop unusable entries and collapse duplicates (first occurrence wins). */
export function normalizeSessionFavorites(value: unknown): SessionFavorite[] {
  if (!Array.isArray(value)) return [];
  const out: SessionFavorite[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { sessionId, sessionDir } = raw as Partial<SessionFavorite>;
    if (typeof sessionId !== 'string' || sessionId.length === 0) continue;
    if (out.some((known) => known.sessionId === sessionId)) continue;
    out.push({ sessionId, sessionDir: typeof sessionDir === 'string' ? sessionDir : '' });
  }
  return out;
}

/**
 * The stored stars, or none when the file is absent or unreadable. Only ever
 * displayed, so an empty list is the safe failure; the write path below never
 * reuses this fallback.
 */
export async function readSessionFavorites(): Promise<SessionFavorite[]> {
  const read = await readJsonForUpdate(storePath());
  if (read.status === 'unreadable') {
    console.error('[node-backend]', `could not read ${storePath()}: ${read.reason}`);
    return [];
  }
  return normalizeSessionFavorites(read.data.favorites);
}

export interface SetSessionFavoriteResult {
  ok: boolean;
  favorites: SessionFavorite[];
}

/**
 * Star or unstar one session, reporting the list as it now stands.
 *
 * Goes through updateJsonFile, which refuses to write over a file it could not
 * read: this replaces the whole array, so treating an unreadable file as empty
 * would turn one failed read into every star being wiped.
 */
export async function setSessionFavorite(
  sessionId: string,
  sessionDir: string,
  favorite: boolean,
): Promise<SetSessionFavoriteResult> {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { ok: true, favorites: await readSessionFavorites() };
  }

  let resulting: SessionFavorite[] = [];
  const outcome = await updateJsonFile(storePath(), (current) => {
    const existing = normalizeSessionFavorites(current.favorites);
    const starred = existing.find((entry) => entry.sessionId === sessionId);

    if (favorite) {
      if (starred && (starred.sessionDir === sessionDir || !sessionDir)) {
        resulting = existing;
        return null;
      }
      // Newest star first, matching how the list sorts everything else.
      resulting = [
        { sessionId, sessionDir: sessionDir || starred?.sessionDir || '' },
        ...existing.filter((entry) => entry.sessionId !== sessionId),
      ];
    } else {
      if (!starred) {
        resulting = existing;
        return null;
      }
      resulting = existing.filter((entry) => entry.sessionId !== sessionId);
    }
    // Spread `current` so a key a newer version adds survives this one.
    return { ...current, favorites: resulting };
  });

  if (outcome.status === 'error') {
    return { ok: false, favorites: await readSessionFavorites() };
  }
  return { ok: true, favorites: resulting };
}
