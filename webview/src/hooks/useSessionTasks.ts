import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { MessageType } from '@/shared';
import type { LoadedMessageDto } from '@/types';
import { useSessionScope } from './useSessionAssets';

export type SessionTaskStatus = 'pending' | 'in_progress' | 'completed';

/** One task as the panel shows it, read off what the CLI wrote. */
export interface SessionTask {
  /** The task's id (task list only; TodoWrite items have none). */
  id: string | null;
  /** TaskCreate's `subject`, or TodoWrite's `content`. */
  title: string;
  description: string | null;
  /** What the task reads as while it runs ("Running tests"). */
  activeForm: string | null;
  status: SessionTaskStatus;
  /** Ids of tasks this one waits on that are not done yet. */
  waitingOn: string[];
  /** The agent the task is assigned to, when the list is shared by a team. */
  owner: string | null;
}

interface TasksResponse {
  status?: string;
  error?: string;
  source?: 'taskList' | 'todoWrite' | null;
  listId?: string;
  tasks?: Record<string, unknown>[];
}

/** The tools that change Claude's task list: a result from one means the list moved. */
const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite']);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

function statusOf(value: unknown): SessionTaskStatus | null {
  if (value === 'completed' || value === 'in_progress' || value === 'pending') return value;
  // A deleted task's file is removed; one caught on the way out is not on the list.
  if (value === 'deleted') return null;
  return 'pending';
}

/** The tasks as written (task files or TodoWrite items) to what the panel shows. */
export function toSessionTasks(raw: Record<string, unknown>[]): SessionTask[] {
  const tasks: SessionTask[] = [];
  for (const item of raw) {
    const status = statusOf(item.status);
    const title = text(item.subject) ?? text(item.content);
    if (!status || !title) continue;
    const id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : null;
    const blockedBy = Array.isArray(item.blockedBy)
      ? item.blockedBy.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number').map(String)
      : [];
    tasks.push({
      id,
      title,
      description: text(item.description),
      activeForm: text(item.activeForm),
      status,
      waitingOn: blockedBy,
      owner: text(item.owner),
    });
  }
  // A blocker that is done (or gone) no longer holds anything up.
  const open = new Set(tasks.filter((t) => t.id && t.status !== 'completed').map((t) => t.id));
  return tasks.map((t) => ({ ...t, waitingOn: t.waitingOn.filter((id) => open.has(id)) }));
}

/** How many task-tool results the loaded messages hold; it grows each time the list changes. */
export function countTaskToolResults(messages: LoadedMessageDto[]): number {
  const ids = new Set<string>();
  let count = 0;
  for (const message of messages) {
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as unknown as Record<string, unknown>[]) {
      if (block?.type === 'tool_use' && typeof block.name === 'string' && TASK_TOOLS.has(block.name) && typeof block.id === 'string') {
        ids.add(block.id);
      } else if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string' && ids.has(block.tool_use_id)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Claude's task list for the current session (the Tasks panel, ported from CC
 * GUI). The dock icon and the panel share one query, asked again when the panel
 * opens, when a task tool returns, and when a turn ends.
 */
export function useSessionTasks(enabled = true, options: { freshOnOpen?: boolean } = {}) {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();
  const { isStreaming, messages } = useChatStreamContext();

  const query = useQuery({
    queryKey: ['session-tasks', workingDir, sessionId],
    enabled: enabled && Boolean(workingDir && sessionId),
    staleTime: 5_000,
    refetchOnMount: options.freshOnOpen ? 'always' : true,
    queryFn: async () => {
      const res = await send<TasksResponse>(MessageType.GET_SESSION_TASKS, { workingDir, sessionId });
      if (res?.status !== 'ok') throw new Error(res?.error ?? 'Could not read the task list');
      return { source: res.source ?? null, tasks: toSessionTasks(Array.isArray(res.tasks) ? res.tasks : []) };
    },
  });

  const { refetch } = query;

  // A TaskCreate/TaskUpdate/TodoWrite result means the CLI has written the list again.
  const taskResults = useMemo(() => countTaskToolResults(messages ?? []), [messages]);
  const seenResults = useRef(taskResults);
  useEffect(() => {
    if (taskResults !== seenResults.current && enabled) void refetch();
    seenResults.current = taskResults;
  }, [taskResults, enabled, refetch]);

  // A turn that just ended may have changed it too (a subagent's task tools are not in the chat).
  const wasStreaming = useRef(isStreaming);
  useEffect(() => {
    if (wasStreaming.current && !isStreaming && enabled) void refetch();
    wasStreaming.current = isStreaming;
  }, [isStreaming, enabled, refetch]);

  const tasks = query.data?.tasks ?? [];
  const done = tasks.filter((t) => t.status === 'completed').length;

  return {
    tasks,
    source: query.data?.source ?? null,
    done,
    total: tasks.length,
    running: tasks.some((t) => t.status === 'in_progress'),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    isStreaming,
  };
}
