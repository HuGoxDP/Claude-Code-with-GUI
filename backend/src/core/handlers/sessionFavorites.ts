import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { join, relative } from 'path';
import {
  readSessionFavorites,
  setSessionFavorite,
  type FavoriteSession,
} from '../features/session-favorites-store';
import { getSessionEntry } from '../features/getSessionEntry';
import type { SessionListEntry } from '../features/getSessionsList';
import { normalizeCwd } from '../entities/project/normalizeCwd';
import { isInsideWorkingDir, isSameWorkingDir, MessageType } from '../../shared';

/**
 * The directory a starred session's row is built from, or null when the star
 * does not belong in a list anchored at [rootDir] (itself, or below it when
 * [includeNested]).
 *
 * A star names its directory in the project's settled spelling (links followed,
 * see normalizeCwd), while the list is anchored at the directory the webview
 * opened, which may be a link to it. Both spellings are compared, and the row
 * is built under the list's own spelling so it reads the same sessions folder
 * the list's rows do.
 */
export function rowDirFor(
  favorite: FavoriteSession,
  rootDir: string,
  settledRoot: string,
  includeNested: boolean,
): string | null {
  const dir = favorite.sessionDir;
  if (!dir) return null;
  if (isSameWorkingDir(dir, rootDir) || isSameWorkingDir(dir, settledRoot)) return rootDir;
  if (!includeNested) return null;
  if (isInsideWorkingDir(dir, rootDir)) return dir;
  if (isInsideWorkingDir(dir, settledRoot)) return join(rootDir, relative(settledRoot, dir));
  return null;
}

/** [rootDir] in the spelling stars are stored in, or as given when it cannot be settled. */
function settle(rootDir: string): string {
  try {
    return normalizeCwd(rootDir);
  } catch {
    return rootDir;
  }
}

/**
 * The starred sessions, plus the list row of each one that belongs to the list
 * the webview is showing.
 *
 * Rows are sent along because the list is paged: a session starred long ago is
 * usually past the page the webview holds, and a star the list cannot draw is a
 * star the user cannot find. Each row is built exactly as the list builds it
 * (getSessionEntry), so merging it in cannot disagree with a listed row.
 *
 * Payload: `{ rootDir?, includeNested? }`. Without rootDir only the ids come back.
 */
export async function getSessionFavoritesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const favorites = await readSessionFavorites();
  const rootDir = typeof message.payload?.rootDir === 'string' ? message.payload.rootDir : '';
  const includeNested = message.payload?.includeNested === true;

  const sessions: SessionListEntry[] = [];
  if (rootDir) {
    const settledRoot = settle(rootDir);
    const wanted = favorites.flatMap((favorite) => {
      const dir = rowDirFor(favorite, rootDir, settledRoot, includeNested);
      return dir === null ? [] : [{ dir, sessionId: favorite.sessionId }];
    });
    const rows = await Promise.all(wanted.map(({ dir, sessionId }) => getSessionEntry(dir, sessionId)));
    for (const row of rows) if (row) sessions.push(row);
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    favorites,
    sessions,
  });
}

/**
 * Star or unstar one session. Replies with the stored list (status `error` when
 * the save failed, so the webview can take back the star it drew early) and
 * tells every other window, whose lists show the same stars.
 */
export async function setSessionFavoriteHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { sessionId, sessionDir, favorite } = (message.payload ?? {}) as {
    sessionId?: unknown;
    sessionDir?: unknown;
    favorite?: unknown;
  };
  const { ok, favorites } = await setSessionFavorite(
    typeof sessionId === 'string' ? sessionId : '',
    typeof sessionDir === 'string' ? sessionDir : '',
    favorite === true,
  );

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: ok ? 'ok' : 'error',
    favorites,
  });
  if (ok) {
    connections.broadcastToAll(MessageType.SESSION_FAVORITES_CHANGED, { favorites });
  }
}
