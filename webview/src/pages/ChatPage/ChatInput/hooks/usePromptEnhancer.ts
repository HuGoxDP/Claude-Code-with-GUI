import { useCallback, useRef, useState } from 'react';
import { MessageType } from '@/shared';
import type { IdeSelectionPayload } from '@/hooks/useIdeSelection';

/**
 * How long to wait for one enhancement. The CLI answers a short draft in well
 * under ten seconds; a cold start on a slow machine, a long draft or a large
 * model can take much longer, and the backend gives up at two minutes.
 */
export const ENHANCE_TIMEOUT_MS = 130_000;

/** What the dialog shows. `idle` is closed. */
export type PromptEnhancerPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface PromptEnhancerState {
  phase: PromptEnhancerPhase;
  /** The draft that was sent, as it was when the user asked. */
  original: string;
  /** The rewrite; editable in the dialog, so this follows the user's edits. */
  enhanced: string;
  /** The CLI's message, or one of the backend's codes (`empty-result`, …). */
  error: string | null;
}

interface EnhanceAck {
  status?: 'ok' | 'error';
  enhancedPrompt?: string;
  error?: string;
}

type Send = <T>(type: string, payload?: Record<string, unknown>, options?: { timeout?: number }) => Promise<T>;

interface Params {
  send: Send;
  workingDirectory: string | null;
  /** The composer's current model; the rewrite comes from the model the user is talking to. */
  model: string;
  /** The editor file and selection, or null when the user has the editor-context tag off. */
  editorContext: IdeSelectionPayload | null;
}

const CLOSED: PromptEnhancerState = { phase: 'idle', original: '', enhanced: '', error: null };

/**
 * Runs one `ENHANCE_PROMPT` request and holds what the dialog shows.
 *
 * Every request gets a number, and an answer is only taken if it belongs to the
 * newest one: closing the dialog or pressing Retry while a request is out must
 * not let the old answer land later in a dialog that has moved on.
 */
export function usePromptEnhancer({ send, workingDirectory, model, editorContext }: Params) {
  const [state, setState] = useState<PromptEnhancerState>(CLOSED);
  const generation = useRef(0);

  const run = useCallback(async (draft: string) => {
    const ticket = ++generation.current;
    setState({ phase: 'loading', original: draft, enhanced: '', error: null });

    const context = editorContext
      ? {
          filePath: editorContext.relativePath || editorContext.absolutePath,
          selectedText: editorContext.selectedText,
          startLine: editorContext.startLine,
          endLine: editorContext.endLine,
        }
      : undefined;

    let next: PromptEnhancerState;
    try {
      const ack = await send<EnhanceAck>(
        MessageType.ENHANCE_PROMPT,
        { prompt: draft, workingDir: workingDirectory ?? undefined, model, context },
        { timeout: ENHANCE_TIMEOUT_MS },
      );
      next = ack?.status === 'ok' && ack.enhancedPrompt
        ? { phase: 'ready', original: draft, enhanced: ack.enhancedPrompt, error: null }
        : { phase: 'error', original: draft, enhanced: '', error: ack?.error ?? null };
    } catch (err) {
      next = { phase: 'error', original: draft, enhanced: '', error: err instanceof Error ? err.message : String(err) };
    }
    if (ticket === generation.current) setState(next);
  }, [send, workingDirectory, model, editorContext]);

  const start = useCallback((draft: string) => {
    if (!draft.trim()) return;
    void run(draft);
  }, [run]);

  const retry = useCallback(() => {
    if (state.original) void run(state.original);
  }, [run, state.original]);

  const close = useCallback(() => {
    generation.current++;
    setState(CLOSED);
  }, []);

  const setEnhanced = useCallback((enhanced: string) => {
    setState((prev) => (prev.phase === 'ready' ? { ...prev, enhanced } : prev));
  }, []);

  return { state, start, retry, close, setEnhanced };
}
