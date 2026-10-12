import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { deleteCustomModel, readCustomModels, saveCustomModel, type CustomModelsResult } from '../features/custom-models';

/**
 * The custom model messages (features/custom-models.ts). Each answers with the
 * whole list; a change is also sent to every window, whose model pickers list
 * the models too.
 */
function answer(connectionId: string, message: IPCMessage, connections: ConnectionManager, result: CustomModelsResult, changed = false): void {
  if (changed && result.ok) connections.broadcastToAll(MessageType.CUSTOM_MODELS_CHANGED, { models: result.models });
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: result.ok ? 'ok' : 'error', ...result });
}

function failed(error: unknown): CustomModelsResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error), models: [] };
}

export async function getCustomModelsHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    answer(connectionId, message, connections, await readCustomModels());
  } catch (err) {
    answer(connectionId, message, connections, failed(err));
  }
}

export async function saveCustomModelHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    answer(connectionId, message, connections, await saveCustomModel((message.payload ?? {}) as Record<string, unknown>), true);
  } catch (err) {
    answer(connectionId, message, connections, failed(err));
  }
}

export async function deleteCustomModelHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager, _bridge: Bridge): Promise<void> {
  try {
    answer(connectionId, message, connections, await deleteCustomModel(message.payload?.id), true);
  } catch (err) {
    answer(connectionId, message, connections, failed(err));
  }
}
