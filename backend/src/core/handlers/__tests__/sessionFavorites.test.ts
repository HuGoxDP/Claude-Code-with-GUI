import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/session-favorites-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/session-favorites-store')>()),
  readSessionFavorites: vi.fn(),
  setSessionFavorite: vi.fn(),
}));
vi.mock('../../features/getSessionEntry', () => ({
  getSessionEntry: vi.fn(),
}));

import { getSessionFavoritesHandler, rowDirFor, setSessionFavoriteHandler } from '../sessionFavorites';
import { FavoriteSession, readSessionFavorites, setSessionFavorite } from '../../features/session-favorites-store';
import { getSessionEntry } from '../../features/getSessionEntry';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const bridge = {} as Bridge;

function connectionsMock() {
  return { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
}

function message(type: MessageType, payload: Record<string, unknown>): IPCMessage {
  return { type, payload, timestamp: 0, requestId: 'r1' };
}

const FAVORITES = [
  new FavoriteSession('here', '/proj'),
  new FavoriteSession('nested', '/proj/pkg'),
  new FavoriteSession('elsewhere', '/other'),
];

describe('getSessionFavoritesHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionFavorites).mockResolvedValue(FAVORITES);
    vi.mocked(getSessionEntry).mockImplementation(async (dir, id) => ({
      sessionId: id,
      sessionDir: dir,
      title: `t-${id}`,
      titleSource: 'prompt',
      lastTimestamp: null,
      createdAt: '',
      messageCount: null,
      isSidechain: false,
    }));
  });

  it('sends every star, and rows only for the ones in the listed directory', async () => {
    const connections = connectionsMock();
    await getSessionFavoritesHandler('c1', message(MessageType.GET_SESSION_FAVORITES, { rootDir: '/proj' }), connections, bridge);
    const reply = vi.mocked(connections.sendTo).mock.calls[0][2] as { favorites: unknown[]; sessions: Array<{ sessionId: string }> };
    expect(reply.favorites).toEqual(FAVORITES);
    expect(reply.sessions.map((s) => s.sessionId)).toEqual(['here']);
  });

  it('includes nested directories when the list merges them', async () => {
    const connections = connectionsMock();
    await getSessionFavoritesHandler('c1', message(MessageType.GET_SESSION_FAVORITES, { rootDir: '/proj', includeNested: true }), connections, bridge);
    const reply = vi.mocked(connections.sendTo).mock.calls[0][2] as { sessions: Array<{ sessionId: string }> };
    expect(reply.sessions.map((s) => s.sessionId)).toEqual(['here', 'nested']);
  });

  it('skips stars whose session can no longer be read', async () => {
    vi.mocked(getSessionEntry).mockResolvedValue(null);
    const connections = connectionsMock();
    await getSessionFavoritesHandler('c1', message(MessageType.GET_SESSION_FAVORITES, { rootDir: '/proj' }), connections, bridge);
    const reply = vi.mocked(connections.sendTo).mock.calls[0][2] as { sessions: unknown[] };
    expect(reply.sessions).toEqual([]);
  });
});

describe('setSessionFavoriteHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the star and tells every window', async () => {
    const stored = [new FavoriteSession('s1', '/proj')];
    vi.mocked(setSessionFavorite).mockResolvedValue({ ok: true, favorites: stored });
    const connections = connectionsMock();
    await setSessionFavoriteHandler('c1', message(MessageType.SET_SESSION_FAVORITE, { sessionId: 's1', sessionDir: '/proj', favorite: true }), connections, bridge);
    expect(setSessionFavorite).toHaveBeenCalledWith('s1', '/proj', true);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'ok', favorites: stored });
    expect(connections.broadcastToAll).toHaveBeenCalledWith(MessageType.SESSION_FAVORITES_CHANGED, { favorites: stored });
  });

  it('reports a failed save without broadcasting it', async () => {
    vi.mocked(setSessionFavorite).mockResolvedValue({ ok: false, favorites: [] });
    const connections = connectionsMock();
    await setSessionFavoriteHandler('c1', message(MessageType.SET_SESSION_FAVORITE, { sessionId: 's1', favorite: true }), connections, bridge);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'error' }));
    expect(connections.broadcastToAll).not.toHaveBeenCalled();
  });
});

describe('rowDirFor', () => {
  const star = (dir: string) => new FavoriteSession('s', dir);

  it('builds the row under the list\'s spelling when the list was opened through a link', () => {
    expect(rowDirFor(star('/real/app'), '/link/app', '/real/app', false)).toBe('/link/app');
    expect(rowDirFor(star('/real/app/pkg'), '/link/app', '/real/app', true)).toBe('/link/app/pkg');
  });

  it('leaves out a nested star unless the list merges nested directories', () => {
    expect(rowDirFor(star('/real/app/pkg'), '/link/app', '/real/app', false)).toBeNull();
  });

  it('leaves out a star with no directory, and one from elsewhere', () => {
    expect(rowDirFor(star(''), '/app', '/app', true)).toBeNull();
    expect(rowDirFor(star('/app-other'), '/app', '/app', true)).toBeNull();
  });
});
