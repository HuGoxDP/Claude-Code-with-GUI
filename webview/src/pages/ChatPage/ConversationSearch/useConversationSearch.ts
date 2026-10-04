import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  buildSearchRegex,
  clearHighlights,
  findMatches,
  paintHighlights,
  revealRange,
  stepIndex,
  type SearchOptions,
} from './searchMatches';

/** Typing settles before the transcript is walked. */
const QUERY_DEBOUNCE_MS = 120;
/** A streaming reply changes the transcript constantly; re-walk at most this often. */
const MUTATION_DEBOUNCE_MS = 250;

export interface ConversationSearchState {
  count: number;
  /** 0-based; -1 when nothing is selected. */
  current: number;
  /** The query is a regex that does not compile. */
  invalid: boolean;
  next: () => void;
  previous: () => void;
}

/**
 * Search the text under [rootRef] while [enabled]. Re-runs when the query or
 * options change and when the transcript itself changes (a streamed reply, an
 * older page loading), keeping the selected match where it was if it still
 * exists. Highlights are cleared when the search closes.
 */
export function useConversationSearch(
  rootRef: RefObject<HTMLElement | null>,
  query: string,
  options: SearchOptions,
  enabled: boolean,
): ConversationSearchState {
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const rangesRef = useRef<Range[]>([]);
  const currentRef = useRef(-1);

  const select = useCallback((index: number, reveal: boolean) => {
    currentRef.current = index;
    setCurrent(index);
    const range = index >= 0 ? rangesRef.current[index] ?? null : null;
    paintHighlights(rangesRef.current, range);
    if (range && reveal) revealRange(range);
  }, []);

  /** Walk the transcript. [fresh] = the query changed, so jump to the first match. */
  const scan = useCallback((fresh: boolean) => {
    const root = rootRef.current;
    const regex = buildSearchRegex(query, options);
    setInvalid(query !== '' && regex === null);
    if (!root || !regex) {
      rangesRef.current = [];
      setCount(0);
      currentRef.current = -1;
      setCurrent(-1);
      clearHighlights();
      return;
    }
    const ranges = findMatches(root, regex);
    rangesRef.current = ranges;
    setCount(ranges.length);
    if (ranges.length === 0) {
      select(-1, false);
    } else if (fresh || currentRef.current < 0) {
      select(0, true);
    } else {
      // The transcript moved under us; stay on the same match number without scrolling.
      select(Math.min(currentRef.current, ranges.length - 1), false);
    }
  }, [rootRef, query, options, select]);

  // Query or options changed.
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => scan(true), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, scan]);

  // The transcript changed.
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || typeof MutationObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        scan(false);
      }, MUTATION_DEBOUNCE_MS);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, rootRef, scan]);

  // Closing leaves nothing painted behind.
  useEffect(() => {
    if (enabled) return;
    rangesRef.current = [];
    currentRef.current = -1;
    setCount(0);
    setCurrent(-1);
    clearHighlights();
  }, [enabled]);

  useEffect(() => () => clearHighlights(), []);

  const next = useCallback(() => {
    select(stepIndex(currentRef.current, rangesRef.current.length, 1), true);
  }, [select]);

  const previous = useCallback(() => {
    select(stepIndex(currentRef.current, rangesRef.current.length, -1), true);
  }, [select]);

  return { count, current, invalid, next, previous };
}
