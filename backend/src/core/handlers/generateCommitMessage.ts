import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { generateCommitMessage } from '../features/commit-message';
import { MessageType } from '../../shared';

/**
 * Write a commit message for what `git commit` would commit in the project:
 * the staged changes, or every change when nothing is staged. The webview's
 * route to the same writer the IDE's commit dialog uses, for a chat that runs
 * without an IDE around it.
 *
 * Payload: `{ workingDir, model? }`. Replies `{ status: 'ok', message, scope }` or
 * `{ status: 'error', error }`, where `error` is a CommitMessageError code or the
 * CLI's own message.
 */
export async function generateCommitMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = typeof message.payload?.workingDir === 'string' ? message.payload.workingDir : '';
  const model = typeof message.payload?.model === 'string' ? message.payload.model : null;
  const reply = (body: Record<string, unknown>) =>
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });

  if (!workingDir) {
    reply({ status: 'error', error: 'workingDir is required' });
    return;
  }
  try {
    const result = await generateCommitMessage({ workingDir, model });
    reply({ status: 'ok', message: result.message, scope: result.scope });
  } catch (err) {
    reply({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
