import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/loadPromptHistory', () => ({
  loadPromptHistory: vi.fn(),
  loadProjectPromptHistory: vi.fn(),
}));

import { loadPromptHistoryHandler, loadProjectPromptHistoryHandler } from '../loadPromptHistory';
import { loadPromptHistory, loadProjectPromptHistory } from '../../features/loadPromptHistory';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function message(payload: Record<string, unknown>): IPCMessage {
  return {
    type: MessageType.LOAD_PROMPT_HISTORY,
    payload,
    timestamp: 0,
    requestId: 'req-1',
  };
}

describe('loadPromptHistoryHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acks with the page on success', async () => {
    vi.mocked(loadPromptHistory).mockResolvedValue({
      entries: [{ type: 'user', uuid: 'u1' }],
      hasMore: true,
      oldestUuid: 'u1',
    });
    const connections = createMockConnections();

    await loadPromptHistoryHandler(
      'conn-1',
      message({ workingDir: '/w', sessionId: 's1', beforeUuid: 'u9' }),
      connections,
      {} as Bridge,
    );

    expect(loadPromptHistory).toHaveBeenCalledWith('/w', 's1', 'u9', undefined);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      entries: [{ type: 'user', uuid: 'u1' }],
      hasMore: true,
      oldestUuid: 'u1',
    });
  });

  it('rejects a request missing workingDir or sessionId without loading', async () => {
    const connections = createMockConnections();

    await loadPromptHistoryHandler('conn-1', message({ sessionId: 's1' }), connections, {} as Bridge);

    expect(loadPromptHistory).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'workingDir and sessionId are required',
    });
  });

  it('acks with an error rather than throwing when the load fails', async () => {
    vi.mocked(loadPromptHistory).mockRejectedValue(new Error('boom'));
    const connections = createMockConnections();

    await loadPromptHistoryHandler(
      'conn-1',
      message({ workingDir: '/w', sessionId: 's1' }),
      connections,
      {} as Bridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'boom',
    });
  });
});

describe('loadProjectPromptHistoryHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acks with the page and the cursor for the next one', async () => {
    const next = { sessionId: 's2', sortedAt: 5, beforeUuid: 'u3' };
    vi.mocked(loadProjectPromptHistory).mockResolvedValue({
      entries: [{ type: 'user', uuid: 'u4', sessionId: 's2' }],
      hasMore: true,
      next,
    });
    const connections = createMockConnections();
    const cursor = { sessionId: 's2', sortedAt: 5, beforeUuid: 'u9' };

    await loadProjectPromptHistoryHandler(
      'conn-1',
      { ...message({ workingDir: '/w', excludeSessionId: 's1', cursor }), type: MessageType.LOAD_PROJECT_PROMPT_HISTORY },
      connections,
      {} as Bridge,
    );

    expect(loadProjectPromptHistory).toHaveBeenCalledWith('/w', { excludeSessionId: 's1', cursor, limit: undefined });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      entries: [{ type: 'user', uuid: 'u4', sessionId: 's2' }],
      hasMore: true,
      next,
    });
  });

  it('needs only the project, since a new chat has no conversation of its own yet', async () => {
    vi.mocked(loadProjectPromptHistory).mockResolvedValue({ entries: [], hasMore: false });
    const connections = createMockConnections();

    await loadProjectPromptHistoryHandler('conn-1', message({ workingDir: '/w' }), connections, {} as Bridge);

    expect(loadProjectPromptHistory).toHaveBeenCalledWith('/w', { excludeSessionId: undefined, cursor: undefined, limit: undefined });
  });

  it('rejects a request without the project, and reports a failed load as an error', async () => {
    const connections = createMockConnections();
    await loadProjectPromptHistoryHandler('conn-1', message({}), connections, {} as Bridge);
    expect(loadProjectPromptHistory).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenLastCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'workingDir is required',
    });

    vi.mocked(loadProjectPromptHistory).mockRejectedValue(new Error('boom'));
    await loadProjectPromptHistoryHandler('conn-1', message({ workingDir: '/w' }), connections, {} as Bridge);
    expect(connections.sendTo).toHaveBeenLastCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'boom',
    });
  });
});
