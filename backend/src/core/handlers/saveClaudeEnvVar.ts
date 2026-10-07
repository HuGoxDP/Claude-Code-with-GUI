import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { readMergedClaudeSettings, saveClaudeEnvVar } from '../features/claude-settings';
import { MessageType } from '../../shared';

/**
 * SAVE_CLAUDE_ENV_VAR — set or remove one variable of Claude's `env` block at a
 * scope, in the file that holds it (see saveClaudeEnvVar). Every open tab hears
 * the new settings, as SAVE_CLAUDE_SETTINGS does.
 */
export async function saveClaudeEnvVarHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const name = message.payload?.name;
  const raw = message.payload?.value;
  const scope = message.payload?.scope === 'project' ? 'project' : 'global';
  const workingDir = message.payload?.workingDir as string | undefined;

  const result =
    typeof name !== 'string'
      ? { status: 'error' as const, error: 'name is required' }
      : raw !== null && typeof raw !== 'string'
        ? { status: 'error' as const, error: 'value must be text, or null to remove the variable' }
        : await saveClaudeEnvVar(name, raw, scope, workingDir);

  if (result.status === 'ok') {
    const { settings, overrides } = await readMergedClaudeSettings(workingDir);
    connections.broadcastToAll(MessageType.CLAUDE_SETTINGS_CHANGED, { settings, overrides });
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...result,
  });
}
