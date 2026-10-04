import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/commit-message', () => ({
  generateCommitMessage: vi.fn(),
}));

import { generateCommitMessage } from '../../features/commit-message';
import { generateCommitMessageHandler } from '../generateCommitMessage';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GENERATE_COMMIT_MESSAGE, payload, timestamp: 0, requestId: 'req-1' };
}

describe('generateCommitMessageHandler', () => {
  beforeEach(() => {
    vi.mocked(generateCommitMessage).mockReset();
  });

  it('writes the message for what git commit would commit', async () => {
    vi.mocked(generateCommitMessage).mockResolvedValue({ message: 'fix: x', scope: 'staged' });
    const connections = { sendTo: vi.fn() } as unknown as ConnectionManager;
    await generateCommitMessageHandler('c1', message({ workingDir: '/r', model: 'opus' }), connections, {} as Bridge);
    expect(generateCommitMessage).toHaveBeenCalledWith({ workingDir: '/r', model: 'opus' });
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'req-1', status: 'ok', message: 'fix: x', scope: 'staged',
    });
  });

  it('reports a missing project and a failure', async () => {
    vi.mocked(generateCommitMessage).mockRejectedValue(new Error('no-changes'));
    const connections = { sendTo: vi.fn() } as unknown as ConnectionManager;
    await generateCommitMessageHandler('c1', message({}), connections, {} as Bridge);
    await generateCommitMessageHandler('c1', message({ workingDir: '/r' }), connections, {} as Bridge);
    expect(vi.mocked(connections.sendTo).mock.calls.map((c) => (c[2] as { error: string }).error))
      .toEqual(['workingDir is required', 'no-changes']);
  });
});
