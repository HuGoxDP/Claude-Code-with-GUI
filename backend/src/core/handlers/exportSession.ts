import { readFile } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import { loadActiveChain } from '../features/loadSessionMessages';
import { extractSessionInfo } from '../features/extractSessionInfo';
import { readSessionTitleOverrides } from '../features/sessionTitleOverrides';
import {
  exportFileName,
  formatForFileName,
  isSessionExportFormat,
  renderSessionMarkdown,
  type SessionExportFormat,
} from '../features/sessionExport';
import { MessageType } from '../../shared';

function reply(
  connections: ConnectionManager,
  connectionId: string,
  message: IPCMessage,
  body: Record<string, unknown>,
): void {
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
}

/**
 * Save one session to a file the user picks — the GUI's `/export`.
 *
 * Payload: `{ sessionId, workingDir, format?: 'markdown' | 'jsonl', fileName? }`.
 * `fileName` is what `/export <name>` passes; its extension picks the format
 * when `format` is absent. The save dialog comes from the Bridge, so this works
 * the same in the IDE (native dialog) and in standalone mode (the OS dialog).
 *
 * Replies `{ status: 'ok', path }`, where `path` is null when the dialog was
 * cancelled, or `{ status: 'error', error }`.
 */
export async function exportSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId;
  const workingDir = message.payload?.workingDir;
  const requestedName = typeof message.payload?.fileName === 'string' ? message.payload.fileName : undefined;
  const requestedFormat = message.payload?.format;

  if (typeof sessionId !== 'string' || !sessionId || sessionId !== basename(sessionId) || sessionId.includes('..')) {
    reply(connections, connectionId, message, { status: 'error', error: 'Invalid sessionId' });
    return;
  }
  if (typeof workingDir !== 'string' || !workingDir) {
    reply(connections, connectionId, message, { status: 'error', error: 'workingDir is required' });
    return;
  }

  const format: SessionExportFormat = isSessionExportFormat(requestedFormat)
    ? requestedFormat
    : formatForFileName(requestedName, 'markdown');

  try {
    const sessionsDir = await getProjectSessionsPath(workingDir);
    const sessionFile = resolve(sessionsDir, `${sessionId}.jsonl`);
    const rel = relative(resolve(sessionsDir), sessionFile);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      reply(connections, connectionId, message, { status: 'error', error: 'Invalid sessionId' });
      return;
    }

    const info = await extractSessionInfo(join(sessionsDir, `${sessionId}.jsonl`));
    const overrides = await readSessionTitleOverrides(sessionsDir);
    const title = overrides[sessionId] ?? info.title;

    let contents: string;
    if (format === 'jsonl') {
      // The transcript exactly as the CLI wrote it — every branch, every field.
      contents = await readFile(sessionFile, 'utf-8');
    } else {
      const chain = await loadActiveChain(workingDir, sessionId);
      if (chain.length === 0) {
        reply(connections, connectionId, message, { status: 'error', error: 'empty-session' });
        return;
      }
      contents = renderSessionMarkdown(chain, { title, sessionId, workingDir, exportedAt: new Date() });
    }

    const result = await bridge.saveFile({
      suggestedName: exportFileName(format, title, sessionId, requestedName),
      contents,
    });
    reply(connections, connectionId, message, { status: 'ok', path: result.path, format });
  } catch (err) {
    console.error('[node-backend]', 'Failed to export session:', sessionId, err);
    reply(connections, connectionId, message, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
