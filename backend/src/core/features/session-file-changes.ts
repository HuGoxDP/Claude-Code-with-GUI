import { readFile, rm, stat } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import { atomicWriteFile } from './atomic-json';

/**
 * The files Claude changed in a session, read from its transcript (ported from CC
 * GUI's status panel).
 *
 * Every successful Edit, MultiEdit and Write leaves a tool result whose
 * `toolUseResult` carries `originalFile` (the file as it was just before) and what
 * was written: Write's `content`, or Edit's strings applied to `originalFile`. So
 * for each file the session knows what it looked like before Claude's first change
 * (null: Claude created it) and what Claude last left there. Subagents' edits are
 * in the same chain (loadActiveChain injects them), and an abandoned branch is not.
 *
 * Nothing here is stored: the list is recomputed from the transcript and the disk
 * each time, so it is never out of step with either.
 */

/** Tools whose results say what they wrote. NotebookEdit is not one of them. */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);

/** Above this a file is listed but not diffed or reverted through the panel. */
export const FILE_CHANGE_MAX_BYTES = 2 * 1024 * 1024;

export interface SessionFileChange {
  filePath: string;
  /** Claude created the file in this session, or changed one that was there. */
  status: 'added' | 'modified';
  /** Lines added and removed between the file before Claude and the file now. */
  additions: number;
  deletions: number;
  /** Successful edits of the file in this session (or since `since`). */
  edits: number;
  /** When Claude last changed it (the tool result's timestamp). */
  lastEditAt: string | null;
  /** The file on disk is no longer what Claude last left there. */
  changedSince: boolean;
  /** The file is gone from disk. */
  missing: boolean;
  /** What the file was before Claude is not in the transcript, so it cannot be put back. */
  revertable: boolean;
}

/** One file's history in the session: before Claude, and what Claude left. */
export interface FileHistory {
  filePath: string;
  /** null: Claude created the file; undefined: not recorded. */
  baseline: string | null | undefined;
  /** What Claude last left in the file; undefined when it could not be worked out. */
  expected: string | undefined;
  edits: number;
  lastEditAt: string | null;
}

type ToolUse = { name: string; input: Record<string, unknown> };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Replace the first (or every) occurrence, as the CLI's Edit does. */
export function applyEdit(content: string, oldString: string, newString: string, replaceAll: boolean): string | undefined {
  if (oldString === '') return content === '' ? newString : undefined;
  const at = content.indexOf(oldString);
  if (at < 0) return undefined;
  return replaceAll
    ? content.split(oldString).join(newString)
    : content.slice(0, at) + newString + content.slice(at + oldString.length);
}

/** What one successful tool result says the file was before and after. */
function readEdit(tool: ToolUse, result: Record<string, unknown>): { before: string | null | undefined; after: string | undefined } {
  const original = result.originalFile;
  const before = typeof original === 'string' ? original : original === null ? null : undefined;

  if (tool.name === 'Write') {
    const content = typeof result.content === 'string' ? result.content : typeof tool.input.content === 'string' ? tool.input.content : undefined;
    // A new file has no originalFile; `type: 'create'` says so even where the field is absent.
    return { before: result.type === 'create' ? null : before, after: content };
  }

  if (typeof before !== 'string') return { before, after: undefined };

  if (tool.name === 'Edit') {
    const oldString = typeof result.oldString === 'string' ? result.oldString : tool.input.old_string;
    const newString = typeof result.newString === 'string' ? result.newString : tool.input.new_string;
    if (typeof oldString !== 'string' || typeof newString !== 'string') return { before, after: undefined };
    const replaceAll = (result.replaceAll ?? tool.input.replace_all) === true;
    return { before, after: applyEdit(before, oldString, newString, replaceAll) };
  }

  // MultiEdit: the edits in order, each on the result of the last.
  const edits = Array.isArray(result.edits) ? result.edits : Array.isArray(tool.input.edits) ? tool.input.edits : null;
  if (!edits) return { before, after: undefined };
  let after: string | undefined = before;
  for (const raw of edits) {
    const edit = asRecord(raw);
    if (!edit || after === undefined) return { before, after: undefined };
    const { old_string: oldString, new_string: newString } = edit;
    if (typeof oldString !== 'string' || typeof newString !== 'string') return { before, after: undefined };
    after = applyEdit(after, oldString, newString, edit.replace_all === true);
  }
  return { before, after };
}

/**
 * Each file's history in [chain], in the order the edits happened. With [since]
 * (an ISO timestamp), only edits after it count: "Keep all" moves it forward.
 */
export function collectFileHistories(chain: SessionMessage[], since?: string | null): FileHistory[] {
  const tools = new Map<string, ToolUse>();
  const files = new Map<string, FileHistory>();

  for (const entry of chain) {
    const message = asRecord(entry.message);
    const content = Array.isArray(message?.content) ? (message!.content as unknown[]) : [];

    if (entry.type === 'assistant') {
      for (const raw of content) {
        const block = asRecord(raw);
        if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          tools.set(block.id, { name: block.name, input: asRecord(block.input) ?? {} });
        }
      }
      continue;
    }

    if (entry.type !== 'user') continue;
    const result = asRecord(entry.toolUseResult);
    if (!result) continue;
    const toolResult = content.map(asRecord).find((b) => b?.type === 'tool_result');
    if (!toolResult || toolResult.is_error === true || typeof toolResult.tool_use_id !== 'string') continue;
    const tool = tools.get(toolResult.tool_use_id);
    if (!tool || !EDIT_TOOLS.has(tool.name)) continue;

    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null;
    if (since && timestamp && timestamp <= since) continue;

    const rawPath = typeof result.filePath === 'string' ? result.filePath : tool.input.file_path;
    if (typeof rawPath !== 'string' || !isAbsolute(rawPath)) continue;
    const filePath = resolve(rawPath);

    const { before, after } = readEdit(tool, result);
    const known = files.get(filePath);
    if (known) {
      known.expected = after;
      known.edits += 1;
      known.lastEditAt = timestamp ?? known.lastEditAt;
    } else {
      files.set(filePath, { filePath, baseline: before, expected: after, edits: 1, lastEditAt: timestamp });
    }
  }

  return [...files.values()];
}

/** The lines of [text]; a final newline ends the last line rather than starting another. */
function linesOf(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Lines added and removed going from [before] to [after], by the longest common
 * subsequence of lines (on the part that differs: the common head and tail are
 * trimmed first, and a part too large to compare in reasonable time is counted
 * whole).
 */
export function lineStats(before: string, after: string): { additions: number; deletions: number } {
  if (before === after) return { additions: 0, deletions: 0 };
  const a = linesOf(before);
  const b = linesOf(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > 4_000_000) return { additions: midB.length, deletions: midA.length };

  let prev = new Array<number>(midB.length + 1).fill(0);
  for (let i = 1; i <= midA.length; i++) {
    const row = new Array<number>(midB.length + 1).fill(0);
    for (let j = 1; j <= midB.length; j++) {
      row[j] = midA[i - 1] === midB[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    prev = row;
  }
  const common = prev[midB.length];
  return { additions: midB.length - common, deletions: midA.length - common };
}

/** The file as it is now: its text, or null when it is gone (or too large / unreadable). */
async function readCurrent(filePath: string): Promise<{ text: string | null; missing: boolean; tooLarge: boolean }> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return { text: null, missing: true, tooLarge: false };
    if (info.size > FILE_CHANGE_MAX_BYTES) return { text: null, missing: false, tooLarge: true };
    return { text: await readFile(filePath, 'utf-8'), missing: false, tooLarge: false };
  } catch {
    return { text: null, missing: true, tooLarge: false };
  }
}

async function summarize(history: FileHistory): Promise<SessionFileChange | null> {
  const current = await readCurrent(history.filePath);
  const baseline = history.baseline;
  // Created and gone again, or back to exactly what it was: nothing changed.
  if (baseline === null && current.missing) return null;
  if (typeof baseline === 'string' && current.text === baseline) return null;

  const stats =
    current.tooLarge || baseline === undefined
      ? { additions: 0, deletions: 0 }
      : lineStats(baseline ?? '', current.text ?? '');

  return {
    filePath: history.filePath,
    status: baseline === null ? 'added' : 'modified',
    additions: stats.additions,
    deletions: stats.deletions,
    edits: history.edits,
    lastEditAt: history.lastEditAt,
    changedSince: history.expected !== undefined && !current.tooLarge && (current.text ?? null) !== history.expected,
    missing: current.missing,
    revertable: baseline !== undefined && !current.tooLarge && (baseline === null || baseline.length <= FILE_CHANGE_MAX_BYTES),
  };
}

async function histories(workingDir: string, sessionId: string, since?: string | null): Promise<FileHistory[]> {
  return collectFileHistories(await loadActiveChain(workingDir, sessionId), since);
}

/** The files the session changed that still differ from how they were, newest change first. */
export async function getSessionFileChanges(
  workingDir: string,
  sessionId: string,
  since?: string | null,
): Promise<SessionFileChange[]> {
  const all = await Promise.all((await histories(workingDir, sessionId, since)).map(summarize));
  return all
    .filter((c): c is SessionFileChange => c !== null)
    .sort((x, y) => (y.lastEditAt ?? '').localeCompare(x.lastEditAt ?? ''));
}

/** Before Claude and now, for the diff. Null when the session did not change the file. */
export async function getSessionFileDiff(
  workingDir: string,
  sessionId: string,
  filePath: string,
  since?: string | null,
): Promise<{ before: string; after: string; tooLarge: boolean } | null> {
  const history = (await histories(workingDir, sessionId, since)).find((h) => h.filePath === resolve(filePath));
  if (!history || history.baseline === undefined) return null;
  const current = await readCurrent(history.filePath);
  if (current.tooLarge || (history.baseline?.length ?? 0) > FILE_CHANGE_MAX_BYTES) {
    return { before: '', after: '', tooLarge: true };
  }
  return { before: history.baseline ?? '', after: current.text ?? '', tooLarge: false };
}

export type RevertOutcome =
  | { filePath: string; ok: true }
  | { filePath: string; ok: false; reason: 'not-changed' | 'unknown' | 'changed-since' | 'too-large' | 'failed'; error?: string };

/**
 * Put [filePaths] back to how they were before Claude changed them in this session:
 * the old text, or no file when Claude created it. Only files the session changed
 * can be named (the transcript decides, not the caller). A file that changed again
 * after Claude's last edit is left alone unless [force]: putting it back would also
 * throw away that change.
 */
export async function revertSessionFileChanges(
  workingDir: string,
  sessionId: string,
  filePaths: string[],
  options: { since?: string | null; force?: boolean } = {},
): Promise<RevertOutcome[]> {
  const byPath = new Map((await histories(workingDir, sessionId, options.since)).map((h) => [h.filePath, h]));
  const outcomes: RevertOutcome[] = [];

  for (const requested of filePaths) {
    const filePath = resolve(requested);
    const history = byPath.get(filePath);
    if (!history) {
      outcomes.push({ filePath, ok: false, reason: 'not-changed' });
      continue;
    }
    if (history.baseline === undefined) {
      outcomes.push({ filePath, ok: false, reason: 'unknown' });
      continue;
    }
    const current = await readCurrent(filePath);
    if (current.tooLarge || (history.baseline?.length ?? 0) > FILE_CHANGE_MAX_BYTES) {
      outcomes.push({ filePath, ok: false, reason: 'too-large' });
      continue;
    }
    if (!options.force && history.expected !== undefined && (current.text ?? null) !== history.expected) {
      outcomes.push({ filePath, ok: false, reason: 'changed-since' });
      continue;
    }
    try {
      if (history.baseline === null) {
        await rm(filePath, { force: true });
      } else {
        await atomicWriteFile(filePath, history.baseline);
      }
      outcomes.push({ filePath, ok: true });
    } catch (err) {
      outcomes.push({ filePath, ok: false, reason: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  }
  return outcomes;
}
