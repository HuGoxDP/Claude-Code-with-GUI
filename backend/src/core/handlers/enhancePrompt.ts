import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { runClaudePrint } from '../features/claude-print';
import {
  buildEnhanceRequest,
  cleanEnhancedPrompt,
  ENHANCE_SYSTEM_PROMPT,
  type EnhanceContext,
} from '../features/prompt-enhancer';
import { MessageType } from '../../shared';

/** Drafts longer than this are refused rather than sent: a rewrite would be the size of a document. */
export const MAX_ENHANCE_PROMPT_LENGTH = 20_000;

function reply(
  connections: ConnectionManager,
  connectionId: string,
  message: IPCMessage,
  body: Record<string, unknown>,
): void {
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
}

function readContext(raw: unknown): EnhanceContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  return {
    filePath: typeof value.filePath === 'string' ? value.filePath : null,
    selectedText: typeof value.selectedText === 'string' ? value.selectedText : null,
    startLine: typeof value.startLine === 'number' ? value.startLine : null,
    endLine: typeof value.endLine === 'number' ? value.endLine : null,
  };
}

/**
 * Rewrite the composer's draft into a clearer prompt.
 *
 * Payload: `{ prompt, workingDir?, model?, context?: { filePath, selectedText, startLine, endLine } }`.
 * `model` is the composer's current model so the rewrite comes from the model the
 * user is talking to; `context` is the editor file/selection, sent only when the
 * user has the editor-context tag switched on.
 *
 * Replies `{ status: 'ok', enhancedPrompt }` or `{ status: 'error', error }`, where
 * `error` is the CLI's own message (a login or quota problem reads as itself).
 */
export async function enhancePromptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const prompt = typeof message.payload?.prompt === 'string' ? message.payload.prompt : '';
  const workingDir = typeof message.payload?.workingDir === 'string' && message.payload.workingDir
    ? message.payload.workingDir
    : undefined;
  const model = typeof message.payload?.model === 'string' ? message.payload.model : null;

  if (!prompt.trim()) {
    reply(connections, connectionId, message, { status: 'error', error: 'empty-prompt' });
    return;
  }
  if (prompt.length > MAX_ENHANCE_PROMPT_LENGTH) {
    reply(connections, connectionId, message, { status: 'error', error: 'prompt-too-long' });
    return;
  }

  try {
    const answer = await runClaudePrint({
      prompt: buildEnhanceRequest(prompt, readContext(message.payload?.context)),
      systemPrompt: ENHANCE_SYSTEM_PROMPT,
      workingDir,
      model,
    });
    const enhancedPrompt = cleanEnhancedPrompt(answer);
    if (!enhancedPrompt) {
      reply(connections, connectionId, message, { status: 'error', error: 'empty-result' });
      return;
    }
    reply(connections, connectionId, message, { status: 'ok', enhancedPrompt });
  } catch (err) {
    console.error('[node-backend]', 'Failed to enhance prompt:', err);
    reply(connections, connectionId, message, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
