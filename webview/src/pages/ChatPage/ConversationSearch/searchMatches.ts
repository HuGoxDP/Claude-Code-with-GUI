/**
 * Finding text in the rendered conversation, for the in-chat search bar.
 *
 * Matches are Ranges over the transcript's text nodes and are painted with the
 * CSS Custom Highlight API, so the DOM is never touched: a streaming reply keeps
 * re-rendering the very nodes a `<mark>`-wrapping search would have split, and
 * React would then trip over nodes it no longer owns. Where the API is missing
 * the search still counts and scrolls; only the paint is lost.
 */

export interface SearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = { matchCase: false, wholeWord: false, regex: false };

/** Painted names, styled by `::highlight(...)` in index.css. */
export const MATCH_HIGHLIGHT = 'ccg-search-match';
export const CURRENT_HIGHLIGHT = 'ccg-search-current';

/** Stop counting past this many: a one-letter query in a long session is not a search anyone reads. */
export const MAX_MATCHES = 2000;

/** Marks a subtree the search must not look into (the composer, buttons' chrome). */
export const SEARCH_SKIP_ATTR = 'data-search-skip';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'BUTTON', 'SELECT', 'OPTION', 'SVG', 'NOSCRIPT']);

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The pattern for a query, or null for an empty query or a regex that does not compile. */
export function buildSearchRegex(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null;
  let pattern = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) pattern = `\\b(?:${pattern})\\b`;
  try {
    return new RegExp(pattern, options.matchCase ? 'g' : 'gi');
  } catch {
    return null;
  }
}

function isSkipped(element: Element | null, root: Node): boolean {
  for (let el = element; el && el !== root; el = el.parentElement) {
    if (SKIPPED_TAGS.has(el.tagName.toUpperCase())) return true;
    if (el.hasAttribute(SEARCH_SKIP_ATTR)) return true;
    if ((el as HTMLElement).isContentEditable) return true;
  }
  return false;
}

/** Hidden text (a folded section, a collapsed card) cannot be scrolled to, so it does not count. */
function isRendered(element: Element | null): boolean {
  if (!element) return false;
  const check = (element as Element & { checkVisibility?: () => boolean }).checkVisibility;
  return typeof check === 'function' ? check.call(element) : true;
}

/**
 * Every match of [regex] inside [root], in document order. A match never spans
 * two text nodes — text split by markup (`foo<b>bar</b>`) is searched piecewise.
 */
export function findMatches(root: Node, regex: RegExp, limit = MAX_MATCHES): Range[] {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (isSkipped(parent, root) || !isRendered(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node && ranges.length < limit; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) && ranges.length < limit) {
      if (match[0].length === 0) {
        // An empty match (`a*`) would loop forever on the same index.
        regex.lastIndex += 1;
        continue;
      }
      const range = doc.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
  }
  return ranges;
}

type HighlightRegistry = Map<string, unknown>;
type HighlightCtor = new (...ranges: Range[]) => unknown;

function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  if (!css?.highlights || typeof Highlight !== 'function') return null;
  return { registry: css.highlights, Highlight };
}

/** Paint [ranges], with [current] in the stronger colour. Returns false where the API is missing. */
export function paintHighlights(ranges: Range[], current: Range | null): boolean {
  const api = highlightApi();
  if (!api) return false;
  api.registry.set(MATCH_HIGHLIGHT, new api.Highlight(...ranges));
  if (current) api.registry.set(CURRENT_HIGHLIGHT, new api.Highlight(current));
  else api.registry.delete(CURRENT_HIGHLIGHT);
  return true;
}

export function clearHighlights(): void {
  const api = highlightApi();
  if (!api) return;
  api.registry.delete(MATCH_HIGHLIGHT);
  api.registry.delete(CURRENT_HIGHLIGHT);
}

/** Bring a match into the middle of the view without moving anything else. */
export function revealRange(range: Range): void {
  const target = range.startContainer.parentElement;
  target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
}

/** Index after moving [delta] from [current] through [count] matches, wrapping both ways. */
export function stepIndex(current: number, count: number, delta: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
