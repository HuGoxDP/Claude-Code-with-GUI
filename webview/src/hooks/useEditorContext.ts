import { useEffect, useRef } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import { MessageType } from '@/shared';

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

/**
 * Validate an unknown IPC payload and return the paths it names: the `items`
 * the project view sends for several files at once, or the single path at the
 * top level otherwise.
 */
export function parseEditorContextPayload(
  raw: Record<string, unknown> | undefined,
): { workingDir: string; items: EditorContextItem[] } | null {
  if (!raw) return null;
  if (typeof raw.workingDir !== 'string') return null;
  const listed = Array.isArray(raw.items)
    ? raw.items.map(parseItem).filter((item): item is EditorContextItem => item !== null)
    : [];
  const single = parseItem(raw);
  const items = listed.length > 0 ? listed : single ? [single] : [];
  if (items.length === 0) return null;
  return { workingDir: raw.workingDir, items };
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
      const key = payload.items.map((item) => `${item.relativePath}:${item.startLine}:${item.endLine}`).join('|');
      const now = Date.now();
      if (lastKeyRef.current === key && now - lastTimeRef.current < DEDUP_WINDOW_MS) {
        return;
      }
      lastKeyRef.current = key;
      lastTimeRef.current = now;

      // Every path goes in at once: inserting them one message at a time would
      // read the composer before the previous insertion has rendered.
      const tokens = payload.items.map(buildEditorContextText);
      const insertText = tokens.join(' ') + ' ';
      const el = textareaRef.current;
      const currentValue = valueRef.current;
      const cursorPos = el ? getCaretOffset(el) : currentValue.length;

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
