import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import {
  deleteSessionTemplate,
  readSessionTemplates,
  saveSessionTemplate,
} from '../features/session-templates-store';

/** GET_SESSION_TEMPLATES — every saved template, by name. */
export async function getSessionTemplatesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    templates: await readSessionTemplates(),
  });
}

/**
 * SAVE_SESSION_TEMPLATE — save `{ name, model, inputMode, effort }`,
 * replacing a template of the same name. Replies with the list as stored.
 */
export async function saveSessionTemplateHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const { ok, error, templates } = await saveSessionTemplate(payload);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: ok ? 'ok' : 'error',
    ...(error ? { error } : {}),
    templates,
  });
}

/** DELETE_SESSION_TEMPLATE — delete `{ name }`. Replies with the list as stored. */
export async function deleteSessionTemplateHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { ok, templates } = await deleteSessionTemplate((message.payload ?? {}).name);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: ok ? 'ok' : 'error',
    templates,
  });
}
