import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));
vi.mock('../../features/getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));
vi.mock('../../features/loadSessionMessages', () => ({
  loadActiveChain: vi.fn(),
}));
vi.mock('../../features/extractSessionInfo', () => ({
  extractSessionInfo: vi.fn(),
}));
vi.mock('../../features/sessionTitleOverrides', () => ({
  readSessionTitleOverrides: vi.fn(),
}));

import { readFile } from 'fs/promises';
import { exportSessionHandler } from '../exportSession';
import { getProjectSessionsPath } from '../../features/getProjectSessionsPath';
import { loadActiveChain } from '../../features/loadSessionMessages';
import { extractSessionInfo } from '../../features/extractSessionInfo';
import { readSessionTitleOverrides } from '../../features/sessionTitleOverrides';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const RAW = '{"type":"user","uuid":"u1","message":{"role":"user","content":"hi"}}\n';

function connectionsMock() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function bridgeMock(path: string | null = '/tmp/out.md') {
  return { saveFile: vi.fn().mockResolvedValue({ path }) } as unknown as Bridge;
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.EXPORT_SESSION, payload, timestamp: 0, requestId: 'req-1' };
}

describe('exportSessionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectSessionsPath).mockResolvedValue('/home/me/.claude/projects/-p');
    vi.mocked(extractSessionInfo).mockResolvedValue({
      title: 'Original title',
      lastTimestamp: null,
      createdAt: '',
      messageCount: null,
      isSidechain: false,
    });
    vi.mocked(readSessionTitleOverrides).mockResolvedValue({});
    vi.mocked(loadActiveChain).mockResolvedValue([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: 'hi' } },
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } },
    ]);
    vi.mocked(readFile).mockResolvedValue(RAW as never);
  });

  it('rejects a path-traversing session id', async () => {
    const connections = connectionsMock();
    const bridge = bridgeMock();
    await exportSessionHandler('c1', message({ sessionId: '../x', workingDir: '/p' }), connections, bridge);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'error' }));
    expect(bridge.saveFile).not.toHaveBeenCalled();
  });

  it('requires a working directory', async () => {
    const connections = connectionsMock();
    await exportSessionHandler('c1', message({ sessionId: 's1' }), connections, bridgeMock());
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({
      status: 'error',
      error: 'workingDir is required',
    }));
  });

  it('saves a Markdown transcript through the bridge, titled by the user override', async () => {
    vi.mocked(readSessionTitleOverrides).mockResolvedValue({ s1: 'My renamed chat' });
    const connections = connectionsMock();
    const bridge = bridgeMock('/tmp/My-renamed-chat.md');
    await exportSessionHandler('c1', message({ sessionId: 's1', workingDir: '/p' }), connections, bridge);

    const saved = vi.mocked(bridge.saveFile).mock.calls[0][0];
    expect(saved.suggestedName).toBe('My-renamed-chat.md');
    expect(saved.contents).toContain('# My renamed chat');
    expect(saved.contents).toContain('hello');
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      path: '/tmp/My-renamed-chat.md',
      format: 'markdown',
    });
  });

  it('saves the JSONL verbatim when asked for the raw transcript', async () => {
    const connections = connectionsMock();
    const bridge = bridgeMock('/tmp/raw.jsonl');
    await exportSessionHandler('c1', message({ sessionId: 's1', workingDir: '/p', format: 'jsonl' }), connections, bridge);
    const saved = vi.mocked(bridge.saveFile).mock.calls[0][0];
    expect(saved.contents).toBe(RAW);
    expect(saved.suggestedName).toBe('Original-title.jsonl');
    expect(loadActiveChain).not.toHaveBeenCalled();
  });

  it('takes the format from /export <name> when none is given', async () => {
    const bridge = bridgeMock();
    await exportSessionHandler('c1', message({ sessionId: 's1', workingDir: '/p', fileName: 'backup.jsonl' }), connectionsMock(), bridge);
    const saved = vi.mocked(bridge.saveFile).mock.calls[0][0];
    expect(saved.suggestedName).toBe('backup.jsonl');
    expect(saved.contents).toBe(RAW);
  });

  it('reports a cancelled dialog as ok with a null path', async () => {
    const connections = connectionsMock();
    await exportSessionHandler('c1', message({ sessionId: 's1', workingDir: '/p' }), connections, bridgeMock(null));
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'ok', path: null }));
  });

  it('refuses to export an empty conversation', async () => {
    vi.mocked(loadActiveChain).mockResolvedValue([]);
    const connections = connectionsMock();
    const bridge = bridgeMock();
    await exportSessionHandler('c1', message({ sessionId: 's1', workingDir: '/p' }), connections, bridge);
    expect(bridge.saveFile).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ error: 'empty-session' }));
  });
});
