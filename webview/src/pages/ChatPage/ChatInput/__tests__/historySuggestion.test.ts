import { describe, it, expect } from 'vitest';
import { historySuggestion, suggestionPreview, HISTORY_SUGGESTION_PREVIEW_CHARS } from '../historySuggestion';

describe('historySuggestion', () => {
  // Newest first, the order the composer's Up walks.
  const history = ['run the tests again', 'Run the linter', 'explain this error', 'run the tests'];

  it('offers the rest of the most recent prompt that starts with what is typed', () => {
    expect(historySuggestion('run the t', history)).toBe('ests again');
    expect(historySuggestion('expl', history)).toBe('ain this error');
  });

  it('ignores case in the comparison and keeps what was typed', () => {
    expect(historySuggestion('RUN THE L', history)).toBe('inter');
  });

  it('offers nothing for fewer than two typed characters', () => {
    expect(historySuggestion('r', history)).toBeNull();
    expect(historySuggestion(' r ', history)).toBeNull();
    expect(historySuggestion('', history)).toBeNull();
  });

  it('offers nothing when no prompt fits, or when the typed text is a whole prompt already', () => {
    expect(historySuggestion('deploy', history)).toBeNull();
    expect(historySuggestion('explain this error', history)).toBeNull();
  });

  it('skips a prompt equal to what is typed and offers a longer one behind it', () => {
    expect(historySuggestion('run the tests', ['run the tests', 'run the tests in watch mode'])).toBe(' in watch mode');
  });

  it('cuts the rest where the typed text ends, even when lowering would change the length', () => {
    // "İ" lowers to two characters; comparing lowered whole strings would cut one too late.
    expect(historySuggestion('i', ['İstanbul'])).toBeNull();
    expect(historySuggestion('İs', ['İstanbul trip'])).toBe('tanbul trip');
  });

  it('carries a multi-line prompt over whole', () => {
    expect(historySuggestion('Review', ['Review this:\n- naming\n- tests'])).toBe(' this:\n- naming\n- tests');
  });
});

describe('suggestionPreview', () => {
  it('shows a short single-line rest as it is', () => {
    expect(suggestionPreview('ests again')).toBe('ests again');
  });

  it('stops at the first line break and marks the cut', () => {
    expect(suggestionPreview(' this:\n- naming\n- tests')).toBe(' this:…');
  });

  it('cuts a long line and marks the cut', () => {
    const long = 'x'.repeat(HISTORY_SUGGESTION_PREVIEW_CHARS + 30);
    expect(suggestionPreview(long)).toBe(`${'x'.repeat(HISTORY_SUGGESTION_PREVIEW_CHARS)}…`);
  });

  it('marks a rest that starts on the next line', () => {
    expect(suggestionPreview('\nmore')).toBe('…');
  });
});
