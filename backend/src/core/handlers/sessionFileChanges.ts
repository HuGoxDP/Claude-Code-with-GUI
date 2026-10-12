import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import {
  getSessionFileChanges,
  getSessionFileDiff,
  revertSessionFileChanges,
} from '../features/session-file-changes';

/**
 * The changed-files panel (ported from CC GUI): which files the session changed,
 * the diff of one, and putting files back. See session-file-changes.ts.
 */

const SESSION_ID = /^[A-Za-z0-9_-]+$/;

interface Payload {
  workingDir?: string;
  sessionId?: string;
  since?: string | null;
  filePath?: string;
  filePaths?: unknown;
  force?: boolean;
}

function readPayload(message: IPCMessage): (Payload & { workingDir: string; sessionId: string }) | null {
  const payload = (message.payload ?? {}) as Payload;
  if (!payload.workingDir || !payload.sessionId || !SESSION_ID.test(payload.sessionId)) return null;
  return { ...payload, workingDir: payload.workingDir, sessionId: payload.sessionId };
}

function reply(connections: ConnectionManager, connectionId: string, message: IPCMessage, body: Record<string, unknown>): void {
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
}

function fail(connections: ConnectionManager, connectionId: string, message: IPCMessage, err: unknown): void {
  reply(connections, connectionId, message, { status: 'error', error: err instanceof Error ? err.message : String(err) });
}

const MISSING = 'workingDir and a valid sessionId are required';

/** GET_SESSION_FILE_CHANGES — the files the session changed that still differ. */
export async function getSessionFileChangesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = readPayload(message);
  if (!payload) return reply(connections, connectionId, message, { status: 'error', error: MISSING });
  try {
    const files = await getSessionFileChanges(payload.workingDir, payload.sessionId, payload.since);
    reply(connections, connectionId, message, { status: 'ok', files });
  } catch (err) {
    fail(connections, connectionId, message, err);
  }
}

/** GET_SESSION_FILE_DIFF — one file before Claude and now. */
export async function getSessionFileDiffHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = readPayload(message);
  if (!payload || typeof payload.filePath !== 'string') {
    return reply(connections, connectionId, message, { status: 'error', error: `${MISSING}, with filePath` });
  }
  try {
    const diff = await getSessionFileDiff(payload.workingDir, payload.sessionId, payload.filePath, payload.since);
    reply(connections, connectionId, message, { status: 'ok', diff });
  } catch (err) {
    fail(connections, connectionId, message, err);
  }
}

/**
 * REVERT_SESSION_FILE_CHANGES — put files back, then tell the IDE to reload them so
 * open editors show the old text. Replies with what happened to each file and the
 * list as it now stands.
 */
export async function revertSessionFileChangesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const payload = readPayload(message);
  const filePaths = Array.isArray(payload?.filePaths)
    ? (payload!.filePaths as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  if (!payload || filePaths.length === 0) {
    return reply(connections, connectionId, message, { status: 'error', error: `${MISSING}, with filePaths` });
  }
  try {
    const outcomes = await revertSessionFileChanges(payload.workingDir, payload.sessionId, filePaths, {
      since: payload.since,
      force: payload.force === true,
    });
    const reverted = outcomes.filter((o) => o.ok).map((o) => o.filePath);
    if (reverted.length > 0) {
      bridge.refreshFiles({ paths: reverted }).catch(() => undefined);
    }
    const files = await getSessionFileChanges(payload.workingDir, payload.sessionId, payload.since);
    reply(connections, connectionId, message, { status: 'ok', outcomes, files });
  } catch (err) {
    fail(connections, connectionId, message, err);
  }
}
