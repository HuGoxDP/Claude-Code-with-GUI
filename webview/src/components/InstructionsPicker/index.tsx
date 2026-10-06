import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { Portal } from '../Portal';
import type { SavedPrompt } from '@/types/prompt';

/** Fired to ask the chat page to open the picker. */
export const OPEN_INSTRUCTIONS_PICKER_EVENT = 'chat:open-instructions-picker';

interface Props {
  /** The library's prompts that a chat here can use: global and this project's. */
  prompts: SavedPrompt[];
  loading: boolean;
  /** Could not read the library; said instead of an empty list that would look like none. */
  error: string | null;
  /** The prompt picked now, if any, so it reads as the current choice. */
  selectedId: string | null;
  onPick: (prompt: SavedPrompt) => void;
  /** "None": start without instructions. */
  onClear: () => void;
  /** Open the prompt library, to write one. */
  onOpenLibrary: () => void;
  onCancel: () => void;
}

/**
 * Picks the saved prompt a new conversation starts with as its instructions
 * (ported from CC GUI's agents, its saved system prompts). The prompts are the
 * Prompt Library's own: there is one place to write them, and its import and
 * export carry them between machines.
 */
export function InstructionsPicker(props: Props) {
  const { prompts, loading, error, selectedId, onPick, onClear, onOpenLibrary, onCancel } = props;
  const { t } = useTranslation('chat');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes this rather than reaching the composer, which binds it too.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return prompts;
    return prompts.filter(
      (prompt) => prompt.name.toLowerCase().includes(needle) || prompt.content.toLowerCase().includes(needle),
    );
  }, [prompts, query]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          role="dialog"
          aria-label={t('instructions.pickerTitle')}
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-3 max-h-[80vh]"
        >
          <div>
            <h2 className="text-md font-semibold text-text-primary">{t('instructions.pickerTitle')}</h2>
            <p className="mt-1 text-xs text-text-tertiary">{t('instructions.pickerHint')}</p>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={t('instructions.search')}
            aria-label={t('instructions.search')}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          />
          <div className="min-h-0 flex-1 overflow-y-auto -mx-1" role="listbox" aria-label={t('instructions.pickerTitle')}>
            <button
              type="button"
              role="option"
              aria-selected={selectedId === null}
              onClick={onClear}
              className="w-full text-start px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover"
            >
              {t('instructions.none')}
            </button>
            {loading && <p className="px-3 py-2 text-sm text-text-tertiary">{t('instructions.loading')}</p>}
            {error && <p className="px-3 py-2 text-sm text-state-error-fg">{t('instructions.loadFailed')}</p>}
            {!loading && !error && prompts.length === 0 && (
              <p className="px-3 py-2 text-sm text-text-tertiary">{t('instructions.empty')}</p>
            )}
            {shown.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                role="option"
                aria-selected={selectedId === prompt.id}
                onClick={() => onPick(prompt)}
                className={`w-full text-start px-3 py-2 rounded-lg hover:bg-surface-hover ${
                  selectedId === prompt.id ? 'bg-surface-hover' : ''
                }`}
              >
                <div className="text-sm text-text-primary truncate">{prompt.name}</div>
                <div className="text-xs text-text-tertiary line-clamp-2 whitespace-pre-wrap">{prompt.content}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenLibrary}
              className="text-sm text-text-link hover:underline"
            >
              {t('instructions.openLibrary')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
            >
              {t('instructions.cancel')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
