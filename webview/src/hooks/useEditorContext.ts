import { useEffect, useRef } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

/**
 * Payload pushed by the backend over the `EDITOR_CONTEXT` IPC message.
 * The IDE reports the file the user is looking at, plus the active
 * selection range (null lines when nothing is selected).
 */
export interface EditorContextPayload {
  absolutePath: string;
  relativePath: string;
  startLine: number | null;
  endLine: number | null;
  workingDir: string;
}

/** One problem the IDE reports in the lines "Fix with Claude" names. */
export interface EditorProblem {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

/** One path to mention. The top-level fields of the payload are the first one. */
export type EditorContextItem = Pick<EditorContextPayload, 'absolutePath' | 'relativePath' | 'startLine' | 'endLine'>;

export interface UseEditorContextParams {
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLDivElement>;
  currentWorkingDir: string;
  /** Move focus + caret after insertion. Defaults to true. */
  shouldFocus?: boolean;
  /**
   * Called with the inserted path token (no trailing space), e.g.
   * `src/file.ts#L10-L25` or `src/file.ts`, so the composer can highlight it
   * as a chip. Fired once per successful insertion.
   */
  onInsertToken?: (token: string) => void;
}

/** Window during which an identical payload is treated as a duplicate. */
const DEDUP_WINDOW_MS = 500;

/** Strip a single trailing slash so two working-dir spellings compare equal. */
function normalizeDir(dir: string): string {
  return dir.replace(/\/+$/, '');
}

/**
 * Build the text inserted into the composer for one path, in the form the
 * Claude Code CLI reads as a file reference:
 *
 * - `@relativePath` without a selection;
 * - `@relativePath#L{start}-{end}` with one, or `#L{line}` for a single line.
 *   The CLI's own pattern is `#L(\d+)(?:-(\d+))?`: a second `L` (`#L10-L25`)
 *   does not match it, and the CLI then attaches the WHOLE file instead of the
 *   lines (checked against the CLI).
 * - `@"…"` around a path holding whitespace, which the CLI would otherwise cut
 *   at the first space.
 *
 * The trailing space is added by the caller at insertion time.
 */
export function buildEditorContextText(payload: EditorContextItem): string {
  const { relativePath, startLine, endLine } = payload;
  let reference = relativePath;
  if (typeof startLine === 'number' && typeof endLine === 'number') {
    reference += startLine === endLine ? `#L${startLine}` : `#L${startLine}-${endLine}`;
  }
  return /\s/.test(reference) ? `@"${reference}"` : `@${reference}`;
}

export interface InsertAtCursorResult {
  nextValue: string;
  nextCaret: number;
}

/**
 * Insert `insertText` into `value` at `cursorPos`, preserving surrounding text.
 * Returns the new value and the caret position immediately after the insertion.
 */
export function insertAtCursor(
  value: string,
  insertText: string,
  cursorPos: number,
): InsertAtCursorResult {
  const pos = Math.max(0, Math.min(cursorPos, value.length));
  const nextValue = value.slice(0, pos) + insertText + value.slice(pos);
  return { nextValue, nextCaret: pos + insertText.length };
}

function parseItem(raw: unknown): EditorContextItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const { absolutePath, relativePath, startLine, endLine } = raw as Record<string, unknown>;
  if (typeof relativePath !== 'string' || relativePath.length === 0) return null;
  return {
    absolutePath: typeof absolutePath === 'string' ? absolutePath : '',
    relativePath,
    startLine: typeof startLine === 'number' ? startLine : null,
    endLine: typeof endLine === 'number' ? endLine : null,
  };
}

/** What an `EDITOR_CONTEXT` push asks the chat input to take. */
export interface ParsedEditorContext {
  workingDir: string;
  items: EditorContextItem[];
  /** Set by "Fix with Claude"; see {@link buildFixText}. */
  problems?: EditorProblem[];
  /** Text selected in a Run/Debug console, which names no path. */
  text?: string;
}

/**
 * Validate an unknown IPC payload and return what it carries: text selected in
 * a console, the `items` the project view sends for several files at once, or
 * the single path at the top level otherwise.
 */
export function parseEditorContextPayload(
  raw: Record<string, unknown> | undefined,
): ParsedEditorContext | null {
  if (!raw) return null;
  if (typeof raw.workingDir !== 'string') return null;
  if (typeof raw.text === 'string') {
    return raw.text.trim() === '' ? null : { workingDir: raw.workingDir, items: [], text: raw.text };
  }
  const listed = Array.isArray(raw.items)
    ? raw.items.map(parseItem).filter((item): item is EditorContextItem => item !== null)
    : [];
  const single = parseItem(raw);
  const items = listed.length > 0 ? listed : single ? [single] : [];
  if (items.length === 0) return null;
  // Only "Fix with Claude" sends a problem list, empty when the IDE reports none.
  if (Array.isArray(raw.problems)) {
    return { workingDir: raw.workingDir, items, problems: raw.problems.map(parseProblem).filter((p): p is EditorProblem => p !== null) };
  }
  return { workingDir: raw.workingDir, items };
}

function parseProblem(raw: unknown): EditorProblem | null {
  if (!raw || typeof raw !== 'object') return null;
  const { line, severity, message } = raw as Record<string, unknown>;
  if (typeof line !== 'number' || typeof message !== 'string' || message.trim() === '') return null;
  if (severity !== 'error' && severity !== 'warning') return null;
  return { line, severity, message };
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The text "Fix with Claude" puts in the chat input: the reference, then the
 * problems the IDE reports in those lines, one per line, with the caret left
 * after them for the user to add what they want. In the interface language,
 * since the user sends it as their own words.
 */
export function buildFixText(reference: string, problems: EditorProblem[], t: Translate): string {
  if (problems.length === 0) return t('fixWithClaude.noProblems', { ref: reference }) + ' ';
  const lines = problems.map((problem) =>
    t('fixWithClaude.problem', { line: problem.line, severity: t(`fixWithClaude.${problem.severity}`), message: problem.message }),
  );
  return [t('fixWithClaude.withProblems', { ref: reference }), ...lines].join('\n') + '\n';
}

/**
 * Text selected in a console, as it goes into the chat input at [cursorPos]:
 * on lines of its own, so a stack trace keeps its shape and does not run into
 * what is already there. The caret goes on the line after it (see
 * {@link withCaretLine} for the end of the input).
 */
export function buildPastedText(value: string, cursorPos: number, text: string): string {
  const body = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const pos = Math.max(0, Math.min(cursorPos, value.length));
  const before = value.slice(0, pos);
  const after = value.slice(pos);
  const lead = before === '' || before.endsWith('\n') ? '' : '\n';
  return lead + body + (after.startsWith('\n') ? '' : '\n');
}

/**
 * [insertText] as it must be written for the caret to land on the empty line
 * after it, when it ends a line and nothing follows it ([after] is empty).
 *
 * The composer is a `plaintext-only` editable, where an empty last line holding
 * the caret is one more `\n` than the text shows, and the first keystroke there
 * replaces it (the shape `appendQuote` leaves too). Without it, the first word
 * typed lands at the end of the inserted text's last line.
 */
export function withCaretLine(insertText: string, after: string): string {
  return insertText.endsWith('\n') && after === '' ? `${insertText}\n` : insertText;
}

/**
 * Subscribe to backend `EDITOR_CONTEXT` pushes and insert the reported file
 * path (with optional line range) into the composer at the current caret.
 *
 * - Filters out payloads from a different working directory.
 * - Dedups identical payloads fired within {@link DEDUP_WINDOW_MS}.
 * - Tracks `value` via a ref to avoid stale-closure re-subscriptions.
 */
export function useEditorContext(params: UseEditorContextParams): void {
  const { value, onChange, textareaRef, currentWorkingDir, shouldFocus = true, onInsertToken } = params;
  const { subscribe } = useBridgeContext();
  const { t } = useTranslation('chat');
  const tRef = useRef(t);
  tRef.current = t;

  // Latest values tracked via refs so the effect can subscribe once and still
  // read fresh state inside the handler (mirrors the useMention pattern).
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const currentWorkingDirRef = useRef(currentWorkingDir);
  currentWorkingDirRef.current = currentWorkingDir;
  const shouldFocusRef = useRef(shouldFocus);
  shouldFocusRef.current = shouldFocus;
  const onInsertTokenRef = useRef(onInsertToken);
  onInsertTokenRef.current = onInsertToken;

  // Dedup bookkeeping.
  const lastKeyRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    return subscribe(MessageType.EDITOR_CONTEXT, (message) => {
      const payload = parseEditorContextPayload(message.payload);
      if (!payload) return;

      // Working-dir filter (trailing-slash tolerant).
      if (normalizeDir(payload.workingDir) !== normalizeDir(currentWorkingDirRef.current)) {
        return;
      }

      // Dedup identical payloads within the time window.
      const key = payload.text !== undefined
        ? `text:${payload.text}`
        : payload.items.map((item) => `${item.relativePath}:${item.startLine}:${item.endLine}`).join('|');
      const now = Date.now();
      if (lastKeyRef.current === key && now - lastTimeRef.current < DEDUP_WINDOW_MS) {
        return;
      }
      lastKeyRef.current = key;
      lastTimeRef.current = now;

      const el = textareaRef.current;
      const currentValue = valueRef.current;
      const cursorPos = el ? getCaretOffset(el) : currentValue.length;

      // Every path goes in at once: inserting them one message at a time would
      // read the composer before the previous insertion has rendered.
      const tokens = payload.items.map(buildEditorContextText);
      let insertText: string;
      if (payload.text !== undefined) insertText = buildPastedText(currentValue, cursorPos, payload.text);
      else if (payload.problems) insertText = buildFixText(tokens[0], payload.problems, tRef.current as Translate);
      else insertText = tokens.join(' ') + ' ';
      insertText = withCaretLine(insertText, currentValue.slice(cursorPos));

      const { nextValue, nextCaret } = insertAtCursor(currentValue, insertText, cursorPos);
      onChangeRef.current(nextValue);
      for (const token of tokens) onInsertTokenRef.current?.(token);

      if (shouldFocusRef.current) {
        requestAnimationFrame(() => {
          const target = textareaRef.current;
          if (!target) return;
          target.focus();
          setCaretOffset(target, nextCaret);
        });
      }
    });
  }, [subscribe, textareaRef]);
}
