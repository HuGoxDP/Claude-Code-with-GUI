import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/claude-print', () => ({
  runClaudePrint: vi.fn(),
}));

import { runClaudePrint } from '../../features/claude-print';
import { enhancePromptHandler, MAX_ENHANCE_PROMPT_LENGTH } from '../enhancePrompt';
import { ENHANCE_SYSTEM_PROMPT } from '../../features/prompt-enhancer';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function connectionsMock() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.ENHANCE_PROMPT, payload, timestamp: 0, requestId: 'req-1' };
}

const bridge = {} as Bridge;

describe('enhancePromptHandler', () => {
  beforeEach(() => {
    vi.mocked(runClaudePrint).mockReset();
  });

  it('answers with the cleaned rewrite', async () => {
    vi.mocked(runClaudePrint).mockResolvedValue('Here is the improved prompt: Add tests for the parser.');
    const connections = connectionsMock();
    await enhancePromptHandler('c1', message({ prompt: 'tests pls', workingDir: '/p', model: 'opus' }), connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      enhancedPrompt: 'Add tests for the parser.',
    });
    expect(runClaudePrint).toHaveBeenCalledWith({
      prompt: '<draft>\ntests pls\n</draft>',
      systemPrompt: ENHANCE_SYSTEM_PROMPT,
      workingDir: '/p',
      model: 'opus',
    });
  });

  it('forwards the editor context', async () => {
    vi.mocked(runClaudePrint).mockResolvedValue('ok');
    await enhancePromptHandler('c1', message({
      prompt: 'fix this',
      context: { filePath: 'src/a.ts', selectedText: 'x()', startLine: 1, endLine: 2 },
    }), connectionsMock(), bridge);
    const request = vi.mocked(runClaudePrint).mock.calls[0]![0].prompt;
    expect(request).toContain('<editor-file>src/a.ts (lines 1-2)</editor-file>');
    expect(request).toContain('x()');
  });

  it('refuses an empty or oversized draft without calling the CLI', async () => {
    const connections = connectionsMock();
    await enhancePromptHandler('c1', message({ prompt: '  ' }), connections, bridge);
    await enhancePromptHandler('c1', message({ prompt: 'a'.repeat(MAX_ENHANCE_PROMPT_LENGTH + 1) }), connections, bridge);
    expect(runClaudePrint).not.toHaveBeenCalled();
    expect(vi.mocked(connections.sendTo).mock.calls.map((c) => (c[2] as { error: string }).error))
      .toEqual(['empty-prompt', 'prompt-too-long']);
  });

  it('passes the CLI error through', async () => {
    vi.mocked(runClaudePrint).mockRejectedValue(new Error('Not logged in · Please run /login'));
    const connections = connectionsMock();
    await enhancePromptHandler('c1', message({ prompt: 'x' }), connections, bridge);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'error',
      error: 'Not logged in · Please run /login',
    });
  });

  it('reports an answer that is empty after cleaning', async () => {
    vi.mocked(runClaudePrint).mockResolvedValue('```\n\n```');
    const connections = connectionsMock();
    await enhancePromptHandler('c1', message({ prompt: 'x' }), connections, bridge);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ error: 'empty-result' }));
  });
});
