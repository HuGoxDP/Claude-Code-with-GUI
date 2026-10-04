import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import {
  readSessionFavorites,
  setSessionFavorite,
  type SessionFavorite,
} from '../features/session-favorites-store';
import { getSessionEntry } from '../features/getSessionEntry';
import type { SessionListEntry } from '../features/getSessionsList';
import { isInsideWorkingDir, isSameWorkingDir, MessageType } from '../../shared';

/** Whether a starred session belongs in a list anchored at [rootDir] (itself or nested). */
function inScope(favorite: SessionFavorite, rootDir: string, includeNested: boolean): boolean {
  if (!favorite.sessionDir) return false;
  if (isSameWorkingDir(favorite.sessionDir, rootDir)) return true;
  return includeNested && isInsideWorkingDir(favorite.sessionDir, rootDir);
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
    const wanted = favorites.filter((f) => inScope(f, rootDir, includeNested));
    const rows = await Promise.all(wanted.map((f) => getSessionEntry(f.sessionDir, f.sessionId)));
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
