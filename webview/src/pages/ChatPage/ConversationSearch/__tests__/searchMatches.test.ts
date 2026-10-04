import { describe, it, expect, beforeEach } from 'vitest';
import { buildSearchRegex, findMatches, stepIndex, DEFAULT_SEARCH_OPTIONS } from '../searchMatches';

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('buildSearchRegex', () => {
  it('matches the query literally and case-insensitively by default', () => {
    const regex = buildSearchRegex('a.b', DEFAULT_SEARCH_OPTIONS)!;
    expect('xA.Bx'.match(regex)).toEqual(['A.B']);
    expect('axb'.match(regex)).toBeNull();
  });

  it('honours match case, whole word and regex', () => {
    expect('Foo foo'.match(buildSearchRegex('foo', { ...DEFAULT_SEARCH_OPTIONS, matchCase: true })!)).toEqual(['foo']);
    expect('cat concat'.match(buildSearchRegex('cat', { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true })!)).toEqual(['cat']);
    expect('a1 b22'.match(buildSearchRegex('\\d+', { ...DEFAULT_SEARCH_OPTIONS, regex: true })!)).toEqual(['1', '22']);
  });

  it('returns null for an empty query or a broken regex', () => {
    expect(buildSearchRegex('', DEFAULT_SEARCH_OPTIONS)).toBeNull();
    expect(buildSearchRegex('(', { ...DEFAULT_SEARCH_OPTIONS, regex: true })).toBeNull();
    // Without regex mode the same text is just a character to find.
    expect(buildSearchRegex('(', DEFAULT_SEARCH_OPTIONS)).not.toBeNull();
  });
});

describe('findMatches', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds every occurrence in document order', () => {
    const el = root('<p>one two one</p><p><b>one</b> more</p>');
    const ranges = findMatches(el, buildSearchRegex('one', DEFAULT_SEARCH_OPTIONS)!);
    expect(ranges.map((r) => r.toString())).toEqual(['one', 'one', 'one']);
    expect(ranges[1].startOffset).toBe(8);
  });

  it('skips the composer, form fields and buttons', () => {
    const el = root(
      '<p>hit</p><div data-search-skip><p>hit</p></div><textarea>hit</textarea><button>hit</button>',
    );
    expect(findMatches(el, buildSearchRegex('hit', DEFAULT_SEARCH_OPTIONS)!)).toHaveLength(1);
  });

  it('survives a pattern that can match nothing and stops at the limit', () => {
    const el = root('<p>aaaa</p>');
    expect(findMatches(el, buildSearchRegex('x*', { ...DEFAULT_SEARCH_OPTIONS, regex: true })!)).toEqual([]);
    expect(findMatches(el, buildSearchRegex('a', DEFAULT_SEARCH_OPTIONS)!, 2)).toHaveLength(2);
  });
});

describe('stepIndex', () => {
  it('wraps both ways and starts at either end', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});
