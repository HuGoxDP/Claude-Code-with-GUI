import { useEffect, useRef } from 'react';
import { useTranslation } from '@/i18n';
import type { PromptEnhancerState } from '@/pages/ChatPage/ChatInput/hooks/usePromptEnhancer';

interface Props {
  state: PromptEnhancerState;
  /** Put this text in the composer in place of the draft. */
  onUse: (enhanced: string) => void;
  /** Close without touching the composer. */
  onClose: () => void;
  onRetry: () => void;
  onChangeEnhanced: (enhanced: string) => void;
}

/** The sparkle used on the composer button and here, so the two read as one feature. */
export function SparkleIcon({ className = 'w-[14px] h-[14px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

/**
 * The draft and its rewrite side by side, so the user decides which one goes in
 * the composer. Nothing is sent from here: "Use enhanced" only replaces the
 * draft, and the user still reads and sends it themselves.
 *
 * The rewrite is editable. A rewrite that is right except for one sentence is
 * the common case, and fixing it here beats taking it and editing it again in
 * the composer, or throwing it away.
 */
export function PromptEnhancerDialog({ state, onUse, onClose, onRetry, onChangeEnhanced }: Props) {
  const { t } = useTranslation('chat');
  const enhancedRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // While loading there is nothing to type in, so focus waits on Cancel; once
  // the rewrite arrives the caret goes to its end, ready for a last edit.
  useEffect(() => {
    if (state.phase === 'ready') {
      const el = enhancedRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    } else {
      closeRef.current?.focus();
    }
  }, [state.phase]);

  if (state.phase === 'idle') return null;

  const canUse = state.phase === 'ready' && state.enhanced.trim() !== '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    // Plain Enter is a new line inside the rewrite; Cmd/Ctrl+Enter takes it.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      if (canUse) onUse(state.enhanced);
    }
  };

  const errorText = (() => {
    switch (state.error) {
      case 'empty-result':
        return t('promptEnhancer.errors.emptyResult');
      case 'prompt-too-long':
        return t('promptEnhancer.errors.tooLong');
      case 'empty-prompt':
        return t('promptEnhancer.errors.emptyPrompt');
      case null:
      case '':
        return t('promptEnhancer.errors.generic');
      default:
        // The CLI's own words: a login, quota or network problem reads as itself.
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
        aria-labelledby="prompt-enhancer-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex max-h-[85vh] w-[min(40rem,92vw)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-xl focus:outline-none"
      >
        <div className="flex flex-shrink-0 items-center gap-2 px-4 pt-4 pb-2">
          <SparkleIcon className="h-4 w-4 text-accent-primary" />
          <h2 id="prompt-enhancer-title" className="text-lg font-semibold text-text-primary">
            {t('promptEnhancer.title')}
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2">
          <div>
            <span className="mb-1 block text-xs text-text-tertiary">{t('promptEnhancer.original')}</span>
            <p
              data-testid="prompt-enhancer-original"
              className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2 text-sm leading-relaxed text-text-secondary"
            >
              {state.original}
            </p>
          </div>

          <div>
            <span className="mb-1 block text-xs text-text-tertiary">{t('promptEnhancer.enhanced')}</span>
            {state.phase === 'loading' && (
              <div
                role="status"
                className="flex min-h-[8rem] items-center justify-center gap-2 rounded-md border border-border-default bg-surface-base text-sm text-text-tertiary"
              >
                <SparkleIcon className="h-4 w-4 animate-pulse text-accent-primary" />
                {t('promptEnhancer.loading')}
              </div>
            )}
            {state.phase === 'ready' && (
              <textarea
                ref={enhancedRef}
                aria-label={t('promptEnhancer.enhanced')}
                value={state.enhanced}
                onChange={(e) => onChangeEnhanced(e.target.value)}
                rows={10}
                className="block max-h-[45vh] min-h-[8rem] w-full resize-y rounded-md border border-border-default bg-surface-base px-3 py-2 text-sm leading-relaxed text-text-primary focus:border-border-focus focus:outline-none"
              />
            )}
            {state.phase === 'error' && (
              <div role="alert" className="rounded-md border border-state-error-border bg-state-error-bg px-3 py-2 text-sm text-state-error-fg">
                <p className="font-medium">{t('promptEnhancer.errors.title')}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{errorText}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3">
          {(state.phase === 'ready' || state.phase === 'error') && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              {t('promptEnhancer.retry')}
            </button>
          )}
          <div className="flex-1" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            {state.phase === 'loading' ? t('promptEnhancer.cancel') : t('promptEnhancer.keepOriginal')}
          </button>
          <button
            type="button"
            disabled={!canUse}
            onClick={() => onUse(state.enhanced)}
            title={t('promptEnhancer.useHint')}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('promptEnhancer.use')}
          </button>
        </div>
      </div>
    </div>
  );
}
