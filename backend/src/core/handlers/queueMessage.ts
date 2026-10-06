import { randomUUID } from 'node:crypto';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import type { QueuedMessage } from '../../shared';
import {
  enqueueMessage,
  removeQueuedMessage,
  reorderQueuedMessages,
  getQueuedMessages,
  type QueuedMessageEntry,
} from '../features/messageQueue';

/** Strip a queue entry down to the wire shape every subscriber gets — see `queued-message.ts` for why attachments are left off. */
function toWirePayload(entry: QueuedMessageEntry): QueuedMessage {
  return { id: entry.id, content: entry.content, queuedAt: entry.queuedAt };
}

/** Broadcast [sessionId]'s current queue to every connection watching it, sender included — nobody keeps a local copy, so the push is the only way any of them knows the queue at all. */
function broadcastQueue(sessionId: string, connections: ConnectionManager): void {
  connections.broadcastToSession(sessionId, MessageType.QUEUED_MESSAGES_CHANGED, {
    sessionId,
    queue: getQueuedMessages(sessionId).map(toWirePayload),
  });
}

/**
 * QUEUE_MESSAGE — hold a follow-up message for [sessionId] instead of writing
 * it to the CLI's stdin.
 *
 * Never touches the CLI process: that is the whole point of the "queue"
 * follow-up behavior over the plain stdin send `sendMessage.ts` does — see
 * `messageQueue.ts` for why. Delivery happens later, one entry per finished
 * turn, from `claude-process.ts`'s `result` handling.
 */
export async function queueMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const content = message.payload?.content as string | undefined;
  const workingDir = message.payload?.workingDir as string | undefined;
  const sessionId = message.payload?.sessionId as string | undefined;
  const attachments = message.payload?.attachments as QueuedMessageEntry['attachments'];

  if (!sessionId || !workingDir || !content) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'sessionId, workingDir and content are required',
    });
    return;
  }

  // Subscribes this connection the same way SEND_MESSAGE does, so the tab that
  // queued a message is itself one of the connections the broadcast below reaches.
  connections.subscribe(connectionId, sessionId, workingDir);

  enqueueMessage(sessionId, {
    id: randomUUID(),
    content,
    attachments,
    queuedAt: Date.now(),
  });

  broadcastQueue(sessionId, connections);

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

/**
 * CANCEL_QUEUED_MESSAGE — remove one held message from [sessionId]'s queue by
 * id, before it is ever sent.
 */
export async function cancelQueuedMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string | undefined;
  const id = message.payload?.id as string | undefined;

  if (sessionId && id) {
    removeQueuedMessage(sessionId, id);
    broadcastQueue(sessionId, connections);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

/**
 * REORDER_QUEUED_MESSAGES — put [sessionId]'s held messages in the order the
 * user dragged them into; the first id is released next. See
 * `reorderQueuedMessages` for how a list that is out of date by the time it
 * arrives is reconciled.
 */
export async function reorderQueuedMessagesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string | undefined;
  const ids = message.payload?.ids;

  if (sessionId && Array.isArray(ids) && ids.every(id => typeof id === 'string')) {
    // Broadcast even when nothing moved: the tab that dragged is showing its
    // own order until the next push, and an unchanged push puts it back.
    reorderQueuedMessages(sessionId, ids);
    broadcastQueue(sessionId, connections);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

/**
 * GET_QUEUED_MESSAGES — the queue [sessionId] already has, for a webview that
 * opens or reconnects to a session after messages were queued elsewhere.
 * Live changes after this arrive as QUEUED_MESSAGES_CHANGED instead.
 */
export async function getQueuedMessagesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string | undefined;

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    sessionId,
    queue: sessionId ? getQueuedMessages(sessionId).map(toWirePayload) : [],
  });
}
