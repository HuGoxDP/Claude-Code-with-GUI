import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { isSkillState, listSkills, setSkillState } from '../features/skills';
import { MessageType } from '../../shared';

function reply(connections: ConnectionManager, connectionId: string, message: IPCMessage, body: Record<string, unknown>): void {
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
}

function workingDirOf(message: IPCMessage): string | null {
  const value = message.payload?.workingDir;
  return typeof value === 'string' && value ? value : null;
}

/**
 * The user's and the project's skills with their current visibility.
 * Payload `{ workingDir? }`; replies `{ status: 'ok', skills }`.
 */
export async function getSkillsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = workingDirOf(message);
  try {
    // The user skills live in this project's Claude data directory, which
    // CLAUDE_CONFIG_DIR can move per project.
    await Claude.applyConfigDir(workingDir ?? undefined);
    reply(connections, connectionId, message, { status: 'ok', skills: await listSkills(workingDir) });
  } catch (err) {
    reply(connections, connectionId, message, { status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Change one skill's visibility through the CLI's `skillOverrides` setting.
 * Payload `{ workingDir?, name, scope: 'user' | 'project', state }`; replies
 * `{ status: 'ok', file, skills }` with the list as it now stands.
 */
export async function setSkillStateHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = workingDirOf(message);
  const name = message.payload?.name;
  const scope = message.payload?.scope;
  const state = message.payload?.state;
  if (typeof name !== 'string' || !name || (scope !== 'user' && scope !== 'project') || !isSkillState(state)) {
    reply(connections, connectionId, message, { status: 'error', error: 'invalid-request' });
    return;
  }
  if (scope === 'project' && !workingDir) {
    reply(connections, connectionId, message, { status: 'error', error: 'workingDir is required for a project skill' });
    return;
  }
  try {
    await Claude.applyConfigDir(workingDir ?? undefined);
    const result = await setSkillState(workingDir, { name, scope }, state);
    if (result.status === 'error') {
      reply(connections, connectionId, message, { status: 'error', error: result.error });
      return;
    }
    reply(connections, connectionId, message, { status: 'ok', file: result.file, skills: await listSkills(workingDir) });
  } catch (err) {
    reply(connections, connectionId, message, { status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
