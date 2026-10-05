import { describe, it, expect, vi, afterEach } from 'vitest';
import { dropStrayText, strayInsertion } from '../dropStrayText';

describe('strayInsertion', () => {
  it('finds a character added after the text', () => {
    expect(strayInsertion('!!', '!!ㄷ')).toEqual({ start: 2, end: 3 });
  });

  it('finds a character added before the text', () => {
    expect(strayInsertion('!!', 'ㄷ!!')).toEqual({ start: 0, end: 1 });
  });

  it('finds a character added in the middle', () => {
    expect(strayInsertion('발!!', '발ㄷ!!')).toEqual({ start: 1, end: 2 });
  });

  it('finds nothing when the text did not change', () => {
    expect(strayInsertion('!!', '!!')).toBeNull();
  });

  it('leaves an edit that is not a pure insertion alone', () => {
    expect(strayInsertion('abc', 'ab')).toBeNull();
    expect(strayInsertion('abc', 'axc')).toBeNull();
  });

  it('takes a repeated character as the one at the end of the run', () => {
    expect(strayInsertion('ㄷ!!', 'ㄷㄷ!!')).toEqual({ start: 1, end: 2 });
  });
});

describe('dropStrayText', () => {
  afterEach(() => vi.restoreAllMocks());

  const composer = (text: string) => {
    const element = document.createElement('div');
    element.contentEditable = 'true';
    element.textContent = text;
    document.body.appendChild(element);
    element.focus();
    return element;
  };

  it('takes the key\'s character back out of the composer, through the browser\'s editing', () => {
    const element = composer('!!ㄷ');
    document.execCommand = vi.fn((_command: string) => {
      element.textContent = '!!';
      return true;
    });
    const report = vi.fn();

    dropStrayText(element, '!!', report);

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, '');
    expect(element.textContent).toBe('!!');
    expect(report).not.toHaveBeenCalled();
  });

  it('reports the old text itself when the browser cannot do the edit', () => {
    const element = composer('!!ㄷ');
    document.execCommand = vi.fn(() => false);
    const report = vi.fn();

    dropStrayText(element, '!!', report);

    expect(report).toHaveBeenCalledWith('!!');
  });

  it('ends the composition by taking the focus off the composer first', () => {
    const element = composer('!!ㄷ');
    const blur = vi.spyOn(element, 'blur');
    document.execCommand = vi.fn(() => true);

    dropStrayText(element, '!!', vi.fn());

    expect(blur).toHaveBeenCalled();
  });

  it('touches nothing when no character was left behind', () => {
    const element = composer('!!');
    document.execCommand = vi.fn(() => true);
    const report = vi.fn();

    dropStrayText(element, '!!', report);

    expect(document.execCommand).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(element.textContent).toBe('!!');
  });
});
