import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import {
  applyApiProvider,
  deleteApiProvider,
  readApiProviders,
  saveApiProvider,
  type ApiProvidersResult,
} from '../features/api-providers';
import { readMergedClaudeSettings } from '../features/claude-settings';

/**
 * The API provider messages (features/api-providers.ts). Each answers with the
 * whole list and the provider in use, so the settings page never holds a stale
 * copy. Using one rewrites the user settings, which every tab hears about as it
 * would any settings change.
 */
async function answer(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  result: ApiProvidersResult,
  settingsChanged = false,
): Promise<void> {
  if (settingsChanged && result.ok) {
    const { settings, overrides } = await readMergedClaudeSettings(message.payload?.workingDir as string | undefined);
    connections.broadcastToAll(MessageType.CLAUDE_SETTINGS_CHANGED, { settings, overrides });
  }
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: result.ok ? 'ok' : 'error', ...result });
}

function failed(error: unknown): ApiProvidersResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error), providers: [], inUse: { kind: 'other' } };
}

export async function getApiProvidersHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    await answer(connectionId, message, connections, await readApiProviders());
  } catch (err) {
    await answer(connectionId, message, connections, failed(err));
  }
}

export async function saveApiProviderHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    const result = await saveApiProvider((message.payload ?? {}) as Record<string, unknown>);
    await answer(connectionId, message, connections, result, true);
  } catch (err) {
    await answer(connectionId, message, connections, failed(err));
  }
}

export async function deleteApiProviderHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    await answer(connectionId, message, connections, await deleteApiProvider(message.payload?.id));
  } catch (err) {
    await answer(connectionId, message, connections, failed(err));
  }
}

export async function applyApiProviderHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    const id = message.payload?.id;
    const result = await applyApiProvider(typeof id === 'number' ? id : null);
    await answer(connectionId, message, connections, result, true);
  } catch (err) {
    await answer(connectionId, message, connections, failed(err));
  }
}
