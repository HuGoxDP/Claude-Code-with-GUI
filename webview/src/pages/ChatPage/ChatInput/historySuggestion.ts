/** Fewer typed characters than this suggest nothing: one letter matches too much to mean anything. */
export const HISTORY_SUGGESTION_MIN_CHARS = 2;

/**
 * How many earlier prompts the composer holds for suggestions to draw on (CC GUI
 * keeps 200 entries, split into fragments). Up alone holds only the page it is
 * about to reach; with suggestions on, pages are loaded in the background up to
 * this, five pages of the backend's twenty.
 */
export const HISTORY_SUGGESTION_POOL = 100;

/** The longest preview of a suggestion; Tab still takes all of it. */
export const HISTORY_SUGGESTION_PREVIEW_CHARS = 120;

/**
 * The rest of the most recent earlier prompt that starts with what is typed, to
 * preview after it (ported from CC GUI's history completion).
 *
 * The prompts are the ones the composer's Up walks, newest first, so "most
 * recent" is simply the first that fits: this conversation's, then the project's
 * other ones. The comparison ignores case, the way the typed start of a sentence
 * so often differs from last time by a capital only; what is typed stays as typed
 * and only the rest is added.
 *
 * @returns The text to add after what is typed, or null when nothing fits.
 */
export function historySuggestion(typed: string, history: readonly string[]): string | null {
  if (typed.trim().length < HISTORY_SUGGESTION_MIN_CHARS) return null;
  const typedLower = typed.toLowerCase();
  for (const prompt of history) {
    if (prompt.length <= typed.length) continue;
    // Compare equal-length starts rather than lowering the whole prompt: lowering
    // can change a string's length (a dotted capital I becomes two characters),
    // which would cut the rest in the wrong place.
    if (prompt.slice(0, typed.length).toLowerCase() !== typedLower) continue;
    return prompt.slice(typed.length);
  }
  return null;
}

/**
 * What of a suggestion is shown after the caret: up to its first line break and
 * at most HISTORY_SUGGESTION_PREVIEW_CHARS, with "…" where it was cut. A prompt
 * can be pages long, and previewing all of it would push the composer to its
 * full height on two typed letters. Tab still takes the whole prompt.
 */
export function suggestionPreview(rest: string): string {
  const firstLine = rest.split('\n', 1)[0];
  const shown = firstLine.slice(0, HISTORY_SUGGESTION_PREVIEW_CHARS);
  return shown.length < rest.length ? `${shown}…` : shown;
}
