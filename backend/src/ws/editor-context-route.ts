import { ConnectionManager, EDITOR_CONTEXT_MESSAGE } from './connection-manager';

/**
 * Result of handling a POST /internal/editor-context request. The caller writes
 * `status` and JSON-serialized `body` back to the HTTP response.
 */
export interface EditorContextRouteResult {
  status: number;
  body: Record<string, unknown>;
}

/** One path to mention, with its selected lines when there is a selection. */
interface EditorContextItem extends Record<string, unknown> {
  absolutePath: string;
  relativePath: string;
  startLine: number | null;
  endLine: number | null;
}

/**
 * Validated editor-context payload pushed to the webview as EDITOR_CONTEXT.
 * Kotlin sends this when the user invokes "Send to Claude Code" on an editor
 * selection (one path) or on files in the project view (`items`, every path,
 * the first of which is repeated at the top level).
 * `startLine`/`endLine` are null when the action fires without a selection.
 */
interface EditorContextPayload extends EditorContextItem {
  workingDir: string;
  items?: EditorContextItem[];
  /**
   * Set by "Fix with Claude": the errors and warnings the IDE reports in the
   * lines named. Present (even empty) only for that action, which is how the
   * webview tells it from Alt+K.
   */
  problems?: EditorProblem[];
}

/** One problem the IDE reports, as the chat input names it. */
interface EditorProblem extends Record<string, unknown> {
  line: number;
  severity: string;
  message: string;
}

/** The most problems one request may name, and the longest message kept. */
export const MAX_EDITOR_PROBLEMS = 20;
export const MAX_EDITOR_PROBLEM_LENGTH = 500;

function parseProblem(value: unknown): EditorProblem | null {
  if (!isRecord(value)) return null;
  const { line, severity, message } = value;
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1) return null;
  if (severity !== 'error' && severity !== 'warning') return null;
  if (typeof message !== 'string' || message.trim() === '') return null;
  return { line, severity, message: message.trim().slice(0, MAX_EDITOR_PROBLEM_LENGTH) };
}

/** The most paths one request may name; a selection beyond it is cut. */
export const MAX_EDITOR_CONTEXT_ITEMS = 200;

/**
 * The longest text one request may carry. Matches the cut the IDE makes before
 * sending (`ConsoleSelection.MAX_TEXT_CHARS` in Kotlin), so this only bites a
 * caller that skipped it.
 */
export const MAX_EDITOR_CONTEXT_TEXT = 200_000;

/**
 * Text selected somewhere that is not a file — a Run/Debug console — to go into
 * the chat input as it is. It names no path, so it has no `items`.
 */
interface EditorContextTextPayload extends Record<string, unknown> {
  text: string;
  workingDir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLine(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function parseItem(value: unknown): EditorContextItem | null {
  if (!isRecord(value)) return null;
  const { absolutePath, relativePath } = value;
  if (typeof absolutePath !== 'string' || typeof relativePath !== 'string' || relativePath.length === 0) return null;
  return {
    absolutePath,
    relativePath,
    startLine: normalizeLine(value.startLine),
    endLine: normalizeLine(value.endLine),
  };
}

/**
 * Parse + validate an editor-context request body and route it to the webview.
 *
 * If a webview is connected, the payload is routed to the last-focused panel's
 * webview (falling back to a broadcast when no focus is known yet or the focused
 * panel has no live connection) as EDITOR_CONTEXT. Otherwise it is stashed (the
 * action may fire during JCEF cold start) and replayed to the first connection
 * that arrives within the TTL.
 *
 * Extracted from the HTTP layer so the validation/routing logic is unit-testable
 * without spinning up a server.
 */
export function handleEditorContextRequest(
  connections: ConnectionManager,
  rawBody: string,
): EditorContextRouteResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  if (!isRecord(parsed)) {
    return { status: 400, body: { error: 'Body must be a JSON object' } };
  }

  const workingDir = typeof parsed.workingDir === 'string' ? parsed.workingDir : '';
  if (typeof parsed.text === 'string') {
    if (parsed.text.trim() === '') {
      return { status: 400, body: { error: 'text must not be blank' } };
    }
    return routeEditorContext(connections, { text: parsed.text.slice(0, MAX_EDITOR_CONTEXT_TEXT), workingDir });
  }

  const { absolutePath, relativePath } = parsed;
  if (typeof absolutePath !== 'string' || typeof relativePath !== 'string') {
    return {
      status: 400,
      body: { error: 'absolutePath and relativePath are required strings' },
    };
  }

  const payload: EditorContextPayload = {
    absolutePath,
    relativePath,
    startLine: normalizeLine(parsed.startLine),
    endLine: normalizeLine(parsed.endLine),
    workingDir,
  };
  if (Array.isArray(parsed.items)) {
    const items = parsed.items
      .slice(0, MAX_EDITOR_CONTEXT_ITEMS)
      .map(parseItem)
      .filter((item): item is EditorContextItem => item !== null);
    if (items.length > 0) payload.items = items;
  }
  if (Array.isArray(parsed.problems)) {
    payload.problems = parsed.problems
      .slice(0, MAX_EDITOR_PROBLEMS)
      .map(parseProblem)
      .filter((problem): problem is EditorProblem => problem !== null);
  }

  return routeEditorContext(connections, payload);
}

/** Hand a validated payload to the panel that should take it. */
function routeEditorContext(
  connections: ConnectionManager,
  payload: EditorContextPayload | EditorContextTextPayload,
): EditorContextRouteResult {
  // What the launcher (Kotlin) should reveal on this Alt+K, decided from the
  // most-recently-focused live panel: focus a JCEF tab, do nothing for a browser
  // tab, or open a fresh tab when nothing is focused. Computed before routing (it
  // only reads state) so the HTTP caller gets it in the same round-trip.
  const revealTarget = connections.getRevealTarget();

  if (connections.getConnectionCount() > 0) {
    connections.routeToFocusedOrBroadcast(EDITOR_CONTEXT_MESSAGE, payload);
  } else {
    connections.setPendingEditorContext(payload);
  }

  return { status: 200, body: { success: true, revealTarget } };
}
