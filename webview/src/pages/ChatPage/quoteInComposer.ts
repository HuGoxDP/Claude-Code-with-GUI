/**
 * Quoting a passage of the conversation into the chat input.
 *
 * The quote is plain Markdown (`> ` before each line), not a chip: Claude reads
 * a blockquote as "this is what I am answering about", the user can edit it
 * before sending, and the transcript keeps exactly what was sent.
 *
 * The message list and the composer do not know each other, so the request
 * travels as a window event, the way the command palette reaches the composer.
 */

/** Window event asking the composer to add a quote. `detail`: `{ text: string }`. */
export const QUOTE_IN_COMPOSER_EVENT = 'ccg:quote-in-composer';

export interface QuoteRequest {
  text: string;
}

/**
 * [text] as a Markdown blockquote. Blank lines at either end are dropped, and a
 * blank line inside stays a quoted blank line (`>`), so the quote does not split
 * into two.
 */
export function toBlockquote(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  return lines.map((line) => (line.trim() === '' ? '>' : `> ${line.trimEnd()}`)).join('\n');
}

/**
 * The draft with [quote] added at its end, separated from what is already
 * there by a blank line, and followed by one so the user types their own words
 * below it. Answers the new draft and where the caret goes.
 *
 * At the end and not at the caret: by the time the user picks "Quote" the
 * caret has left the composer for the message they selected, so its last
 * position says nothing about where they want the quote.
 *
 * Three newlines follow the quote for one blank line: the composer is a
 * `plaintext-only` editable, where an empty last line holding the caret is one
 * more `\n` than the text shows, and the first keystroke there replaces it.
 * Shift+Enter leaves the same shape (typing "abc", Shift+Enter twice gives
 * `abc\n\n\n`); with only two, the first word typed lands right under the
 * quote, where Markdown reads it as part of the quote.
 */
export function appendQuote(draft: string, quote: string): { value: string; caret: number } {
  const body = draft.replace(/\s+$/, '');
  const value = body === '' ? `${quote}\n\n\n` : `${body}\n\n${quote}\n\n\n`;
  return { value, caret: value.length };
}

/** Ask the composer to add [text] as a quote. */
export function requestQuote(text: string): void {
  if (text.trim() === '') return;
  window.dispatchEvent(new CustomEvent<QuoteRequest>(QUOTE_IN_COMPOSER_EVENT, { detail: { text } }));
}
