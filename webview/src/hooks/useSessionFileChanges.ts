import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { MessageType } from '@/shared';
import { useSessionScope } from './useSessionAssets';

/** One file the session changed, as GET_SESSION_FILE_CHANGES reports it. */
export interface SessionFileChange {
  filePath: string;
  status: 'added' | 'modified';
  additions: number;
  deletions: number;
  edits: number;
  lastEditAt: string | null;
  changedSince: boolean;
  missing: boolean;
  revertable: boolean;
}

export type RevertReason = 'not-changed' | 'unknown' | 'changed-since' | 'too-large' | 'failed';
export type RevertOutcome = { filePath: string; ok: true } | { filePath: string; ok: false; reason: RevertReason; error?: string };

interface ListResponse {
  status?: string;
  error?: string;
  files?: SessionFileChange[];
}

interface RevertResponse extends ListResponse {
  outcomes?: RevertOutcome[];
}

// ─── "Keep all": the point the list starts from, per session ──────────────────
//
// A per-viewer convenience (like a collapsed section), so it lives in this
// browser's storage: it hides what was already looked at, and nothing is lost
// if it is forgotten. Stored as the newest edit's own timestamp, not this
// clock's, so a viewer on another machine (a tunnel) cannot skew it.

const KEPT_PREFIX = 'ccg-file-changes-kept:';
const KEPT_EVENT = 'ccg-file-changes-kept';

function readKept(sessionId: string | undefined): string | null {
  if (!sessionId) return null;
  try {
    return localStorage.getItem(KEPT_PREFIX + sessionId);
  } catch {
    return null;
  }
}

function writeKept(sessionId: string, since: string | null): void {
  try {
    if (since) localStorage.setItem(KEPT_PREFIX + sessionId, since);
    else localStorage.removeItem(KEPT_PREFIX + sessionId);
  } catch {
    // Storage blocked: "Keep all" then lasts until the next query, which is all it can do.
  }
  window.dispatchEvent(new Event(KEPT_EVENT));
}

function subscribeKept(onChange: () => void): () => void {
  window.addEventListener(KEPT_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(KEPT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The files Claude changed in the current session that still differ from how they
 * were (the changed-files panel, ported from CC GUI). The dock icon and the panel
 * share one query, which is asked again whenever a turn ends.
 */
export function useSessionFileChanges(enabled = true, options: { freshOnOpen?: boolean } = {}) {
  const { send } = useBridgeContext();
  const queryClient = useQueryClient();
  const { workingDir, sessionId } = useSessionScope();
  const { isStreaming } = useChatStreamContext();
  const since = useSyncExternalStore(subscribeKept, () => readKept(sessionId), () => null);
  const queryKey = ['session-file-changes', workingDir, sessionId, since];

  const query = useQuery({
    queryKey,
    enabled: enabled && Boolean(workingDir && sessionId),
    staleTime: 5_000,
    // The panel reads the disk again whenever it opens: a file can change outside the
    // chat at any time, and the panel is where that is reported.
    refetchOnMount: options.freshOnOpen ? 'always' : true,
    queryFn: async (): Promise<SessionFileChange[]> => {
      const res = await send<ListResponse>(MessageType.GET_SESSION_FILE_CHANGES, { workingDir, sessionId, since });
      if (res?.status !== 'ok') throw new Error(res?.error ?? 'Could not read the changed files');
      return Array.isArray(res.files) ? res.files : [];
    },
  });

  // A turn that just ended may have changed files.
  const wasStreaming = useRef(isStreaming);
  const { refetch } = query;
  useEffect(() => {
    if (wasStreaming.current && !isStreaming && enabled) void refetch();
    wasStreaming.current = isStreaming;
  }, [isStreaming, enabled, refetch]);

  const files = query.data ?? [];

  /** Put files back; the reply carries the list as it now stands. */
  const revert = useCallback(
    async (filePaths: string[], force = false): Promise<RevertOutcome[]> => {
      const res = await send<RevertResponse>(MessageType.REVERT_SESSION_FILE_CHANGES, {
        workingDir,
        sessionId,
        filePaths,
        since,
        force,
      });
      if (res?.status !== 'ok') throw new Error(res?.error ?? 'Could not revert');
      if (Array.isArray(res.files)) queryClient.setQueryData(['session-file-changes', workingDir, sessionId, since], res.files);
      return res.outcomes ?? [];
    },
    [send, queryClient, workingDir, sessionId, since],
  );

  /** Accept everything listed: the list then starts after the newest edit in it. */
  const keepAll = useCallback(() => {
    if (!sessionId) return;
    const newest = files.reduce<string | null>((max, f) => (f.lastEditAt && (!max || f.lastEditAt > max) ? f.lastEditAt : max), since);
    if (newest) writeKept(sessionId, newest);
  }, [sessionId, files, since]);

  /** Show every change of the session again. */
  const showAll = useCallback(() => {
    if (sessionId) writeKept(sessionId, null);
  }, [sessionId]);

  return {
    files,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    since,
    refresh: refetch,
    revert,
    keepAll,
    showAll,
    workingDir,
    sessionId,
  };
}

/** Before Claude and now, for one file's diff. */
export function useSessionFileDiff(filePath: string | null) {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();
  const since = useSyncExternalStore(subscribeKept, () => readKept(sessionId), () => null);
  return useQuery({
    queryKey: ['session-file-diff', workingDir, sessionId, since, filePath],
    enabled: Boolean(filePath && workingDir && sessionId),
    staleTime: 0,
    queryFn: async (): Promise<{ before: string; after: string; tooLarge: boolean } | null> => {
      const res = await send<{ status?: string; error?: string; diff?: { before: string; after: string; tooLarge: boolean } | null }>(
        MessageType.GET_SESSION_FILE_DIFF,
        { workingDir, sessionId, since, filePath },
      );
      if (res?.status !== 'ok') throw new Error(res?.error ?? 'Could not read the diff');
      return res.diff ?? null;
    },
  });
}
