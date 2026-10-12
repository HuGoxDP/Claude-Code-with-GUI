import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';
import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import { resolveEnv } from './settings-env';

/**
 * Claude's task list for a session (the Tasks panel, ported from CC GUI's status
 * panel), read from where Claude Code itself keeps it.
 *
 * Current Claude Code tracks work with TaskCreate / TaskUpdate and writes each task
 * to `<CLAUDE_CONFIG_DIR>/tasks/<list id>/<task id>.json`. The list id is
 * `CLAUDE_CODE_TASK_LIST_ID` when set (a list shared between sessions) and the
 * session id otherwise; both are made file-safe the way the CLI does it. That folder
 * is what the terminal's own task list shows, so it wins whenever it exists — even
 * empty, which is how the CLI leaves it after clearing a finished list.
 *
 * Older Claude Code (and sessions that never made the folder) kept the list in the
 * transcript instead: every TodoWrite call carries the whole list, so the last one
 * on the active chain is the list as Claude last left it.
 *
 * The tasks go out as the CLI wrote them: a task file's JSON, or one item of
 * TodoWrite's `todos`, unedited.
 */

export interface SessionTasks {
  /** Where the list was read from; null when the session has none. */
  source: 'taskList' | 'todoWrite' | null;
  /** The task list's id (its folder name), for source 'taskList'. */
  listId?: string;
  tasks: Record<string, unknown>[];
}

/** The CLI's own rule for turning a list or task id into a file name. */
export function fileSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Task files sort by their id as a number (1, 2, … 10), the order the CLI lists them. */
function byTaskId(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const na = Number(a.id);
  const nb = Number(b.id);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

/** The tasks in a task list folder, or null when there is no such folder. */
export async function readTaskListDir(dir: string): Promise<Record<string, unknown>[] | null> {
  try {
    if (!(await stat(dir)).isDirectory()) return null;
  } catch {
    return null;
  }
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const tasks: Record<string, unknown>[] = [];
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    try {
      const task = asRecord(JSON.parse(await readFile(join(dir, name), 'utf8')));
      if (task) tasks.push(task);
    } catch {
      // Half-written or removed while reading: the next read sees it settled.
    }
  }
  return tasks.sort(byTaskId);
}

/** The `todos` of the last TodoWrite call on the chain, or null when there is none. */
export function lastTodoWrite(chain: SessionMessage[]): Record<string, unknown>[] | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i];
    if (entry.type !== 'assistant') continue;
    const content = asRecord(entry.message)?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const block = asRecord(content[j]);
      if (block?.type !== 'tool_use' || block.name !== 'TodoWrite') continue;
      const todos = asRecord(block.input)?.todos;
      if (!Array.isArray(todos)) continue;
      return todos.filter((item): item is Record<string, unknown> => asRecord(item) !== null);
    }
  }
  return null;
}

export async function getSessionTasks(workingDir: string, sessionId: string): Promise<SessionTasks> {
  const env = await resolveEnv(workingDir);
  const listId = fileSafeId(env.CLAUDE_CODE_TASK_LIST_ID || sessionId);
  const fromDir = await readTaskListDir(join(getClaudeConfigDir(), 'tasks', listId));
  if (fromDir) return { source: 'taskList', listId, tasks: fromDir };

  const todos = lastTodoWrite(await loadActiveChain(workingDir, sessionId));
  if (todos) return { source: 'todoWrite', tasks: todos };

  return { source: null, tasks: [] };
}
