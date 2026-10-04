import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ArrowDownIcon, ArrowUpIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { OPEN_CONVERSATION_SEARCH_EVENT } from './events';
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from './searchMatches';
import { useConversationSearch } from './useConversationSearch';

const OPTIONS_STORAGE_KEY = 'ccg.conversationSearch.options';

function loadOptions(): SearchOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_SEARCH_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<SearchOptions>;
    return { matchCase: parsed.matchCase === true, wholeWord: parsed.wholeWord === true, regex: parsed.regex === true };
  } catch {
    return DEFAULT_SEARCH_OPTIONS;
  }
}

function saveOptions(options: SearchOptions): void {
  try {
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Storage unavailable: the toggles simply reset next time.
  }
}

interface Props {
  /** What is searched: the transcript's scroll container. */
  rootRef: RefObject<HTMLElement | null>;
}

/**
 * Find in the conversation — Cmd/Ctrl+F.
 *
 * A small bar over the top of the transcript: type to highlight every match,
 * Enter / Shift+Enter (or the arrows) to walk them, Esc to close. Match case,
 * whole word and regex toggle with Alt+C / Alt+W / Alt+R, like an editor's find
 * widget, and are remembered. Only what the transcript has loaded and shows is
 * searched; a folded section or an older page that has not been loaded is not.
 */
export function ConversationSearch({ rootRef }: Props) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>(loadOptions);
  const inputRef = useRef<HTMLInputElement>(null);
  const { count, current, invalid, next, previous } = useConversationSearch(rootRef, query, options, open);

  useEffect(() => {
    const show = () => {
      setOpen(true);
      // Already open: take the cursor back and select the query to retype it.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    };
    window.addEventListener(OPEN_CONVERSATION_SEARCH_EVENT, show);
    return () => window.removeEventListener(OPEN_CONVERSATION_SEARCH_EVENT, show);
  }, []);

  const toggle = useCallback((key: keyof SearchOptions) => {
    setOptions((prev) => {
      const nextOptions = { ...prev, [key]: !prev[key] };
      saveOptions(nextOptions);
      return nextOptions;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const toggles: Record<string, keyof SearchOptions> = { KeyC: 'matchCase', KeyW: 'wholeWord', KeyR: 'regex' };
      const option = toggles[e.code];
      if (option) {
        e.preventDefault();
        e.stopPropagation();
        toggle(option);
        return;
      }
    }
    if (e.key === 'Enter' || e.key === 'F3') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) previous();
      else next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  if (!open) return null;

  let status = '';
  if (query) {
    if (invalid) status = t('conversationSearch.invalidRegex');
    else if (count === 0) status = t('conversationSearch.noResults');
    else status = t('conversationSearch.counter', { current: current + 1, total: count });
  }
  const noResults = query !== '' && (invalid || count === 0);

  const toggleClass = (on: boolean) =>
    `px-1 h-5 min-w-5 rounded text-[0.7rem] font-mono transition-colors ${
      on ? 'bg-accent-claude/20 text-text-primary border border-accent-claude/60' : 'text-text-tertiary hover:text-text-primary border border-transparent'
    }`;
  const iconButton = 'p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div
      role="search"
      aria-label={t('conversationSearch.label')}
      data-search-skip
      className="fixed top-11 end-4 z-40 flex items-center gap-1 ps-2 pe-1 py-1 rounded-md border border-border-default bg-surface-raised shadow-lg text-xs"
    >
      <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('conversationSearch.placeholder')}
        aria-label={t('conversationSearch.placeholder')}
        aria-invalid={noResults}
        spellCheck={false}
        className={`w-44 bg-transparent outline-none text-text-primary placeholder:text-text-tertiary ${noResults ? 'text-state-error-fg' : ''}`}
      />
      <button type="button" className={toggleClass(options.matchCase)} onClick={() => toggle('matchCase')}
        title={t('conversationSearch.matchCase')} aria-label={t('conversationSearch.matchCase')} aria-pressed={options.matchCase}>
        Aa
      </button>
      <button type="button" className={toggleClass(options.wholeWord)} onClick={() => toggle('wholeWord')}
        title={t('conversationSearch.wholeWord')} aria-label={t('conversationSearch.wholeWord')} aria-pressed={options.wholeWord}>
        <span className="underline">ab</span>
      </button>
      <button type="button" className={toggleClass(options.regex)} onClick={() => toggle('regex')}
        title={t('conversationSearch.regex')} aria-label={t('conversationSearch.regex')} aria-pressed={options.regex}>
        .*
      </button>
      <span className="min-w-14 text-center text-text-tertiary tabular-nums" aria-live="polite" data-testid="conversation-search-status">
        {status}
      </span>
      <button type="button" className={iconButton} onClick={previous} disabled={count === 0}
        title={t('conversationSearch.previous')} aria-label={t('conversationSearch.previous')}>
        <ArrowUpIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={iconButton} onClick={next} disabled={count === 0}
        title={t('conversationSearch.next')} aria-label={t('conversationSearch.next')}>
        <ArrowDownIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={iconButton} onClick={close}
        title={t('conversationSearch.close')} aria-label={t('conversationSearch.close')}>
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
