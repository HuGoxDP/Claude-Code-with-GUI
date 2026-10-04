import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { MessageType } from '@/shared';
import { SparkleIcon } from '@/components/PromptEnhancerDialog';

/**
 * Fired by the command palette's "Write a commit message". The chat page opens
 * {@link CommitMessageDialog}.
 */
export const OPEN_COMMIT_MESSAGE_EVENT = 'command-palette:open-commit-message';

/** The backend gives the model two minutes; this waits a little longer for its answer. */
export const COMMIT_MESSAGE_TIMEOUT_MS = 130_000;

type Scope = 'selected' | 'staged' | 'all';

interface Ack {
  status?: 'ok' | 'error';
  message?: string;
  scope?: Scope;
  error?: string;
}

type Send = <T>(type: string, payload?: Record<string, unknown>, options?: { timeout?: number }) => Promise<T>;

interface Props {
  send: Send;
  workingDirectory: string | null;
  /** The composer's current model, so the message comes from the model the user picked. */
  model: string;
  onClose: () => void;
}

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; message: string; scope: Scope }
  | { phase: 'error'; error: string | null };

/**
 * A commit message for what `git commit` would commit in this project, written
 * by the backend (git diff + one `claude -p`) — the same writer the IDE's commit
 * dialog button uses, for a chat that runs without an IDE around it.
 *
 * It writes, the user copies. Committing stays the user's: in their terminal,
 * their Git client, or by asking Claude in the chat.
 */
export function CommitMessageDialog({ send, workingDirectory, model, onClose }: Props) {
  const { t } = useTranslation('chat');
  const [state, setState] = useState<State>({ phase: 'loading' });
  const generation = useRef(0);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const generate = useCallback(async () => {
    const ticket = ++generation.current;
    setState({ phase: 'loading' });
    let next: State;
    try {
      const ack = await send<Ack>(
        MessageType.GENERATE_COMMIT_MESSAGE,
        { workingDir: workingDirectory ?? undefined, model },
        { timeout: COMMIT_MESSAGE_TIMEOUT_MS },
      );
      next = ack?.status === 'ok' && ack.message
        ? { phase: 'ready', message: ack.message, scope: ack.scope ?? 'all' }
        : { phase: 'error', error: ack?.error ?? null };
    } catch (err) {
      next = { phase: 'error', error: err instanceof Error ? err.message : String(err) };
    }
    if (ticket === generation.current) setState(next);
  }, [send, workingDirectory, model]);

  useEffect(() => {
    void generate();
    // Closing while a request is out must not let its answer land later.
    return () => { generation.current++; };
  }, [generate]);

  useEffect(() => {
    if (state.phase === 'ready') fieldRef.current?.focus();
    else closeRef.current?.focus();
  }, [state.phase]);

  const copy = useCallback(() => {
    if (state.phase !== 'ready' || !state.message.trim()) return;
    navigator.clipboard.writeText(state.message).then(
      () => {
        toast.success(t('commitMessage.copied'));
        onClose();
      },
      () => toast.error(t('commitMessage.copyFailed')),
    );
  }, [state, onClose, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      copy();
    }
  };

  const errorText = (() => {
    if (state.phase !== 'error') return '';
    switch (state.error) {
      case 'no-changes':
        return t('commitMessage.errors.noChanges');
      case 'not-a-repository':
        return t('commitMessage.errors.notARepository');
      case 'empty-result':
        return t('commitMessage.errors.emptyResult');
      case null:
      case '':
        return t('commitMessage.errors.generic');
      default:
        // The CLI's own words (login, quota, network) read best as they are.
        return state.error;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commit-message-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex max-h-[85vh] w-[min(40rem,92vw)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-xl focus:outline-none"
      >
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <SparkleIcon className="h-4 w-4 text-accent-primary" />
            <h2 id="commit-message-title" className="text-lg font-semibold text-text-primary">
              {t('commitMessage.title')}
            </h2>
          </div>
          {state.phase === 'ready' && (
            <p className="mt-1 text-xs text-text-tertiary" data-testid="commit-message-scope">
              {state.scope === 'staged' ? t('commitMessage.scope.staged') : t('commitMessage.scope.all')}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {state.phase === 'loading' && (
            <div
              role="status"
              className="flex min-h-[8rem] items-center justify-center gap-2 rounded-md border border-border-default bg-surface-base text-sm text-text-tertiary"
            >
              <SparkleIcon className="h-4 w-4 animate-pulse text-accent-primary" />
              {t('commitMessage.loading')}
            </div>
          )}
          {state.phase === 'ready' && (
            <textarea
              ref={fieldRef}
              aria-label={t('commitMessage.title')}
              value={state.message}
              onChange={(e) => setState({ ...state, message: e.target.value })}
              rows={10}
              spellCheck={false}
              className="block max-h-[50vh] min-h-[8rem] w-full resize-y rounded-md border border-border-default bg-surface-base px-3 py-2 font-mono text-sm leading-relaxed text-text-primary focus:border-border-focus focus:outline-none"
            />
          )}
          {state.phase === 'error' && (
            <div role="alert" className="rounded-md border border-state-error-border bg-state-error-bg px-3 py-2 text-sm text-state-error-fg">
              <p className="font-medium">{t('commitMessage.errors.title')}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{errorText}</p>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3">
          {state.phase !== 'loading' && (
            <button
              type="button"
              onClick={() => void generate()}
              className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              {t('commitMessage.regenerate')}
            </button>
          )}
          <div className="flex-1" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            {state.phase === 'loading' ? t('commitMessage.cancel') : t('commitMessage.close')}
          </button>
          <button
            type="button"
            disabled={state.phase !== 'ready' || !state.message.trim()}
            onClick={copy}
            title={t('commitMessage.copyHint')}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('commitMessage.copy')}
          </button>
        </div>
      </div>
    </div>
  );
}
