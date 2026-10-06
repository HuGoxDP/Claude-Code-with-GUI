import { beforeEach, expect, it, vi } from 'vitest';
import { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType } from '../../../shared';
import { sendMessageHandler } from '../sendMessage';
import { ensureClaudeProcess } from '../../claude-process';
import { readPromptContentForProject } from '../../features/prompts';

vi.mock('../../claude-process', () => ({ ensureClaudeProcess: vi.fn(), restartClaudeSessionProcess: vi.fn(), sendMessageToProcess: vi.fn() }));
vi.mock('../../features/prompts', () => ({ readPromptContentForProject: vi.fn(async () => 'Always answer in haiku.') }));
vi.mock('../../features/account-pool-recovery-store', () => ({ claimAccountPoolContinuation: vi.fn(async () => true), clearAccountPoolRecovery: vi.fn() }));
vi.mock('../../features/telemetry', () => ({ trackEvent: vi.fn() }));

const connections = new ConnectionManager(true);
vi.spyOn(connections, 'subscribe').mockImplementation(() => {});
vi.spyOn(connections, 'sendTo').mockImplementation(() => {});
vi.spyOn(connections, 'broadcastToSession').mockImplementation(() => {});
const bridge = {} as Bridge;

function send(payload: Record<string, unknown>) {
  return sendMessageHandler('tab', { type: MessageType.SEND_MESSAGE, requestId: 'r', timestamp: 0,
    payload: { sessionId: 'session', workingDir: '/fixture', content: 'hello', ...payload } }, connections, bridge);
}

/** What the handler handed ensureClaudeProcess as the instructions argument. */
const instructionsPassed = () => vi.mocked(ensureClaudeProcess).mock.calls[0][7];

beforeEach(() => { vi.clearAllMocks(); });

it('starts a new conversation with the saved prompt it was given', async () => {
  await send({ isNewSession: true, instructionsPromptId: 'p-1' });
  expect(readPromptContentForProject).toHaveBeenCalledWith('p-1', '/fixture');
  expect(instructionsPassed()).toBe('Always answer in haiku.');
});

it('ignores instructions for a conversation that already exists', async () => {
  // The CLI keeps the system prompt a session started with, so the choice
  // would not reach it; no lookup, nothing passed.
  await send({ isNewSession: false, instructionsPromptId: 'p-1' });
  expect(readPromptContentForProject).not.toHaveBeenCalled();
  expect(instructionsPassed()).toBeUndefined();
});

it('still sends the message when the prompt is gone', async () => {
  vi.mocked(readPromptContentForProject).mockResolvedValueOnce(null);
  await send({ isNewSession: true, instructionsPromptId: 'deleted' });
  expect(ensureClaudeProcess).toHaveBeenCalledTimes(1);
  expect(instructionsPassed()).toBeUndefined();
});

it('passes nothing when no prompt was chosen', async () => {
  await send({ isNewSession: true });
  expect(readPromptContentForProject).not.toHaveBeenCalled();
  expect(instructionsPassed()).toBeUndefined();
});
