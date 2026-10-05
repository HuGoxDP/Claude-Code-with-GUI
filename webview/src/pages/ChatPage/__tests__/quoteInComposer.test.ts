import { describe, it, expect, vi } from 'vitest';
import { QUOTE_IN_COMPOSER_EVENT, appendQuote, requestQuote, toBlockquote } from '../quoteInComposer';

describe('toBlockquote', () => {
  it('puts every line behind a quote marker', () => {
    expect(toBlockquote('first\nsecond')).toBe('> first\n> second');
  });

  it('keeps a blank line inside the quote quoted, so it stays one quote', () => {
    expect(toBlockquote('a\n\nb')).toBe('> a\n>\n> b');
  });

  it('drops blank lines at either end and trailing spaces', () => {
    expect(toBlockquote('\n\n  a  \r\n\n')).toBe('>   a');
  });
});

describe('appendQuote', () => {
  it('starts an empty draft with the quote and leaves a blank line to type under', () => {
    // The third newline is the empty line the caret sits on; the first keystroke replaces it.
    expect(appendQuote('', '> a')).toEqual({ value: '> a\n\n\n', caret: 6 });
  });

  it('adds the quote after what is already written, one blank line apart', () => {
    const { value, caret } = appendQuote('my question\n\n\n', '> a');
    expect(value).toBe('my question\n\n> a\n\n\n');
    expect(caret).toBe(value.length);
  });
});

describe('requestQuote', () => {
  it('asks the composer with the text, and not at all for blank text', () => {
    const listener = vi.fn();
    window.addEventListener(QUOTE_IN_COMPOSER_EVENT, listener);
    requestQuote('   ');
    requestQuote('passage');
    window.removeEventListener(QUOTE_IN_COMPOSER_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ text: 'passage' });
  });
});
