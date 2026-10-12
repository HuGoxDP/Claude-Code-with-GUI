import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getSessionTasks } from '../features/session-tasks';

const SESSION_ID = /^[A-Za-z0-9_-]+$/;

/** GET_SESSION_TASKS — Claude's task list for a session (the Tasks panel). See session-tasks.ts. */
export async function getSessionTasksHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = (message.payload ?? {}) as { workingDir?: string; sessionId?: string };
  const reply = (body: Record<string, unknown>) =>
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });

  if (!payload.workingDir || !payload.sessionId || !SESSION_ID.test(payload.sessionId)) {
    return reply({ status: 'error', error: 'workingDir and a valid sessionId are required' });
  }
  try {
    const result = await getSessionTasks(payload.workingDir, payload.sessionId);
    reply({ status: 'ok', ...result });
  } catch (err) {
    reply({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
