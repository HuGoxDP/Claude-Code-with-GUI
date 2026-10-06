import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useBridge } from '@/hooks/useBridge';
import { MessageType, isQueueOperation } from '@/shared';
import { getTextContent, type LoadedMessageDto } from '@/types';
import { stripSystemReminders } from '@/pages/ChatPage/message-renderers/utils/parseUserContent';

/**
 * How close to the end of the loaded history the cursor may get before the next
 * page is fetched. Small, because a page is 20: the fetch starts while the user
 * still has entries left to walk through, so the next Up press finds them there.
 */
const PREFETCH_MARGIN = 3;

/**
 * The text of one prompt entry, whichever shape the CLI wrote it in.
 *
 * A prompt typed while a turn was running has no `user` entry to read: the CLI
 * only recorded queue bookkeeping, which carries the text at the top level
 * instead of under `message.content`. Reading just one of the two shapes is what
 * made those prompts skip in the walk.
 */
function promptTextOf(entry: Record<string, unknown>): string {
  const raw = isQueueOperation(entry)
    ? typeof entry.content === 'string'
      ? entry.content
      : ''
    : getTextContent(entry as unknown as LoadedMessageDto);
  // What was STORED is not what was TYPED. A send that addresses another
  // session, or cancels a task, carries a `<system-reminder>` the GUI wrapped
  // around the user's words — measured: Up recalled the whole delivery
  // instruction, tag and markers and all, straight into the composer.
  //
  // Only the reminder is taken off here. The `<session-mention>` tag stays, so
  // the composer can put the chip back as a live chip rather than as dead text
  // that looks addressed and is not.
  return stripSystemReminders(raw).trim();
}

interface PromptHistoryResponse {
  status: string;
  entries?: Record<string, unknown>[];
  hasMore?: boolean;
  oldestUuid?: string;
  error?: string;
}

/** Where the project-wide walk goes on; opaque here, handed back as it came. */
interface ProjectHistoryCursor {
  sessionId: string;
  sortedAt: number;
  beforeUuid?: string;
}

interface ProjectHistoryResponse {
  status: string;
  entries?: Record<string, unknown>[];
  hasMore?: boolean;
  next?: ProjectHistoryCursor;
  error?: string;
}

interface UseInputHistoryArgs {
  workingDirectory: string | null | undefined;
  sessionId: string | null;
  /**
   * Keep loading pages in the background until this many prompts are held, or
   * the project has no more. Suggestions from history read what is held, so
   * they ask for a fuller list than Up alone needs. 0 (the default) loads only
   * what Up is about to reach.
   */
  preload?: number;
}

interface UseInputHistoryReturn {
  /** Record a prompt the user just sent, so Up finds it without a round trip. */
  pushToHistory: (value: string) => void;
  /** The previous prompt, or null when there is none (the key then falls through). */
  navigateUp: (currentValue: string) => string | null;
  /** The next prompt, or the draft that was being written when navigation began. */
  navigateDown: () => string | null;
  /** Abandon navigation and forget the saved draft. */
  resetHistory: () => void;
  /** Every prompt held, newest first, in the order Up walks them. */
  entries: readonly string[];
  isEmpty: boolean;
  isNavigating: boolean;
}

/** The texts of a page as Up walks them: newest first, blanks dropped. */
function textsOf(entries: Record<string, unknown>[] | undefined): string[] {
  return (entries ?? [])
    .map(promptTextOf)
    .filter(text => text.trim().length > 0)
    .reverse();
}

/**
 * The composer's up/down-arrow prompt history: the conversation it is in first,
 * then the project's other conversations, the most recently active first.
 *
 * The prompts come from the backend rather than from the loaded transcript. They
 * have to: a transcript page is 50 *entries*, and entries are overwhelmingly
 * tool_result plumbing, so measured over 119 sessions of this repo only 129 of
 * 3,190 typed prompts (4%) fall inside the newest page — and in the largest
 * session, none of its 193 prompts did. Deriving the history from `messages`, the
 * way this hook used to, therefore produced an empty or near-empty list for any
 * resumed session.
 *
 * Going on into the other conversations is what the CLI's own Up does: a new
 * terminal session still recalls what was typed in the last one. A prompt that
 * is already in the list is not repeated, so walking back through "yes" and
 * "continue" does not take a press per conversation. The other conversations are
 * asked for only once this one has no more pages, which keeps the list growing
 * at its end only, so a walk in progress never has entries move under it.
 *
 * Pages arrive newest-first and are appended as the user walks back, so opening a
 * session costs one small request instead of the whole prompt list (which reaches
 * 21MB for a session whose prompts carry pasted screenshots).
 */
export function useInputHistory({
  workingDirectory,
  sessionId,
  preload = 0,
}: UseInputHistoryArgs): UseInputHistoryReturn {
  const { send } = useBridge();

  // Prompts fetched from the backend for this conversation, newest first.
  const [fetched, setFetched] = useState<string[]>([]);
  // Prompts sent from this composer since the session was loaded, newest first.
  // Kept apart from `fetched` because the backend only learns about them once the
  // CLI has written them to the transcript; holding them here means Up finds the
  // prompt just sent immediately, with no round trip and no re-fetch.
  const [localSent, setLocalSent] = useState<string[]>([]);
  // Prompts of the project's other conversations, newest first, as fetched.
  const [projectFetched, setProjectFetched] = useState<string[]>([]);

  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [unsavedDraft, setUnsavedDraft] = useState<string>('');
  // Counts landed pages, so the preload below goes on after a page that brought
  // nothing new (every prompt in it already held) and left the list as long.
  const [pagesLanded, setPagesLanded] = useState(0);

  // Paging state lives in refs: it changes as pages land but must never re-render
  // the composer, and the fetch callback reads the current values directly.
  const cursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const projectCursorRef = useRef<ProjectHistoryCursor | undefined>(undefined);
  const projectHasMoreRef = useRef(true);
  const projectLoadingRef = useRef(false);
  // Guards against a page from a session the user has already left being applied
  // to the session they moved to.
  const loadedSessionRef = useRef<string | null>(null);
  // Bumped whenever the history is thrown away, so a project page that was asked
  // for before that lands nowhere.
  const generationRef = useRef(0);

  const fetchProjectPage = useCallback(async () => {
    if (!workingDirectory || projectLoadingRef.current || !projectHasMoreRef.current) return;
    // This conversation first: its older pages would otherwise land in front of
    // the other conversations' prompts and move a walk in progress.
    if (hasMoreRef.current || loadingRef.current) return;
    projectLoadingRef.current = true;
    const generation = generationRef.current;
    try {
      const res = await send<ProjectHistoryResponse>(MessageType.LOAD_PROJECT_PROMPT_HISTORY, {
        workingDir: workingDirectory,
        excludeSessionId: loadedSessionRef.current ?? undefined,
        cursor: projectCursorRef.current,
      });
      if (generation !== generationRef.current) return;
      if (res.status !== 'ok') {
        projectHasMoreRef.current = false;
        return;
      }
      projectHasMoreRef.current = !!res.hasMore;
      projectCursorRef.current = res.next;
      const texts = textsOf(res.entries);
      setProjectFetched(prev => [...prev, ...texts]);
      setPagesLanded(n => n + 1);
    } catch {
      // As with this conversation's pages: Up simply stops finding older prompts.
      if (generation === generationRef.current) projectHasMoreRef.current = false;
    } finally {
      if (generation === generationRef.current) projectLoadingRef.current = false;
    }
  }, [workingDirectory, send]);

  const fetchPage = useCallback(async (targetSessionId: string, beforeUuid?: string) => {
    if (!workingDirectory || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await send<PromptHistoryResponse>(MessageType.LOAD_PROMPT_HISTORY, {
        workingDir: workingDirectory,
        sessionId: targetSessionId,
        beforeUuid,
      });
      if (res.status !== 'ok') return;
      if (loadedSessionRef.current !== targetSessionId) return;

      // The backend sends the entries untouched, in transcript order. Reverse to
      // newest-first (the order Up walks) and take the text here, where display
      // processing belongs.
      const texts = textsOf(res.entries);

      hasMoreRef.current = !!res.hasMore;
      cursorRef.current = res.oldestUuid;
      setFetched(prev => (beforeUuid ? [...prev, ...texts] : texts));
      setPagesLanded(n => n + 1);
    } catch {
      // A failed page leaves the history at whatever already loaded. Nothing to
      // report to the user: the arrow key simply stops finding older prompts.
    } finally {
      loadingRef.current = false;
    }
    // This conversation is done: have the other conversations' first page ready
    // before Up gets there.
    if (loadedSessionRef.current === targetSessionId && !hasMoreRef.current) {
      void fetchProjectPage();
    }
  }, [workingDirectory, send, fetchProjectPage]);

  // The session this hook last reacted to. `undefined` means "not yet mounted",
  // which is distinct from `null` (mounted on a session that does not exist yet).
  const previousSessionRef = useRef<string | null | undefined>(undefined);

  // Load the newest page when the session changes, and drop everything the
  // previous session had.
  useEffect(() => {
    const previous = previousSessionRef.current;
    previousSessionRef.current = sessionId;
    // Kept current in both branches: it is what tells a landing page which
    // session it belongs to, and a session born here still pages later.
    loadedSessionRef.current = sessionId;

    // A null → id change is not a switch to another conversation: it is this
    // composer's own session coming into existence, created by the prompt that
    // was just sent. Everything below would throw that prompt away and then ask
    // the backend for a transcript that either does not have it yet or has it
    // already — a lost entry or a duplicated one. A session born here has no
    // history but what was typed here, so leave it alone. The other
    // conversations' prompts already held stay right too: none of them is this
    // new one, and the pages still to come leave it out.
    if (previous === null && sessionId) return;

    generationRef.current += 1;
    setFetched([]);
    setLocalSent([]);
    setProjectFetched([]);
    setHistoryIndex(-1);
    setUnsavedDraft('');
    cursorRef.current = undefined;
    hasMoreRef.current = false;
    loadingRef.current = false;
    projectCursorRef.current = undefined;
    projectHasMoreRef.current = true;
    projectLoadingRef.current = false;

    if (!workingDirectory) return;
    // A new chat has no conversation of its own to start with: Up goes straight
    // to the other conversations, as it does in a new terminal session.
    if (!sessionId) {
      void fetchProjectPage();
      return;
    }
    void fetchPage(sessionId);
  }, [sessionId, workingDirectory, fetchPage, fetchProjectPage]);

  const pushToHistory = useCallback((value: string) => {
    setLocalSent(prev => [value, ...prev]);
    setHistoryIndex(-1);
    setUnsavedDraft('');
  }, []);

  const resetHistory = useCallback(() => {
    setHistoryIndex(-1);
    setUnsavedDraft('');
  }, []);

  // This conversation's prompts as they are, then the other conversations' minus
  // any prompt already in the list.
  const history = useMemo(() => {
    const own = [...localSent, ...fetched];
    const seen = new Set(own);
    const others: string[] = [];
    for (const text of projectFetched) {
      if (seen.has(text)) continue;
      seen.add(text);
      others.push(text);
    }
    return [...own, ...others];
  }, [localSent, fetched, projectFetched]);

  // The next page to fetch, whichever source it comes from.
  const fetchMore = useCallback(() => {
    if (hasMoreRef.current && sessionId) {
      void fetchPage(sessionId, cursorRef.current);
      return;
    }
    void fetchProjectPage();
  }, [sessionId, fetchPage, fetchProjectPage]);

  // Fill up to `preload` in the background. Each landed page re-renders, which
  // runs this again, so it stops on its own once the target or the end is reached.
  useEffect(() => {
    if (preload <= 0 || history.length >= preload) return;
    fetchMore();
  }, [preload, history.length, pagesLanded, fetchMore]);

  const navigateUp = useCallback((currentValue: string): string | null => {
    const newIndex = historyIndex + 1;
    if (newIndex >= history.length) return null;

    if (historyIndex === -1) setUnsavedDraft(currentValue);
    setHistoryIndex(newIndex);

    // Start the next page while entries are still left to walk, so it is already
    // there by the time the cursor reaches the end.
    if (newIndex >= history.length - PREFETCH_MARGIN) fetchMore();

    return history[newIndex];
  }, [history, historyIndex, fetchMore]);

  const navigateDown = useCallback((): string | null => {
    if (historyIndex === -1) return null;

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    if (newIndex === -1) return unsavedDraft;

    return history[newIndex];
  }, [history, historyIndex, unsavedDraft]);

  return {
    pushToHistory,
    navigateUp,
    navigateDown,
    resetHistory,
    entries: history,
    isEmpty: history.length === 0,
    isNavigating: historyIndex !== -1,
  };
}
