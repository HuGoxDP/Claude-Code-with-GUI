/**
 * Structural guards for the chat colors in index.css (Settings → Appearance →
 * Chat). jsdom does no cascade from this file, so a component test can see the
 * class and the attribute in place and still miss the rule that reads them.
 */
import { describe, it, expect } from 'vitest';
// `?raw` rather than node:fs — the webview tsconfig targets DOM only.
import css from '../../index.css?raw';
// The config as text: it is plain JS with no types, and only its wording matters here.
import tailwindConfig from '../../../tailwind.config.js?raw';
import { CUSTOM_HEADER_CLASS, CUSTOM_USER_MESSAGE_CLASS } from '@/utils/chatColors';

function block(selectorStartsWith: string): string {
  const start = css.indexOf(selectorStartsWith);
  if (start === -1) throw new Error(`selector not found: ${selectorStartsWith}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  return css.slice(open + 1, close);
}

/** The `:root` block that follows the "Chat colors of your own" heading. */
function chatRoot(): string {
  const open = css.indexOf(':root {', css.indexOf('Chat colors of your own'));
  return css.slice(open + ':root {'.length, css.indexOf('\n}', open));
}

/** `--x: value;` pairs of a block, in order. */
function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

describe('chat colors — stylesheet structure', () => {
  it('follows the theme for every area until a color is set', () => {
    const defaults = declarations(chatRoot());
    expect(defaults['--chat-background-rgb']).toBe('var(--chat-background-light-rgb, var(--surface-base-rgb))');
    expect(defaults['--chat-header-rgb']).toBe('var(--surface-base-rgb)');
    expect(defaults['--chat-user-message-rgb']).toBe('var(--surface-hover-rgb)');
  });

  it('reads the dark palette\'s own background in the dark theme', () => {
    // The light theme's dark text must never land on a color chosen for the
    // dark theme, so each palette reads its own variable.
    const dark = css.slice(css.indexOf('.dark {', css.indexOf('Chat colors of your own')));
    const body = declarations(dark.slice(0, dark.indexOf('\n}')));
    expect(body['--chat-background-rgb']).toBe('var(--chat-background-dark-rgb, var(--surface-base-rgb))');
  });

  it('re-points, inside a colored area, exactly the tokens the menus out of it restore', () => {
    // A token re-pointed in the header and not restored in its menus paints
    // the menu with text meant for the bar.
    const header = declarations(block(`html.${CUSTOM_HEADER_CLASS} [data-chat-header] {`));
    const menu = declarations(block(`html.${CUSTOM_HEADER_CLASS} [data-chat-header] [data-header-menu] {`));
    expect(Object.keys(header).length).toBeGreaterThan(0);
    expect(Object.keys(menu).sort()).toEqual(Object.keys(header).sort());
    for (const [token, value] of Object.entries(menu)) {
      expect(value).toBe(`var(--theme-${token.slice(2)})`);
      expect(header[token]).toMatch(/^var\(--chat-header-/);
    }
  });

  it('keeps a theme copy of every token it re-points', () => {
    const defaults = declarations(chatRoot());
    const header = declarations(block(`html.${CUSTOM_HEADER_CLASS} [data-chat-header] {`));
    const own = declarations(block(`html.${CUSTOM_USER_MESSAGE_CLASS} [data-own-message] {`));
    for (const token of [...Object.keys(header), ...Object.keys(own)]) {
      expect(defaults[`--theme-${token.slice(2)}`], token).toBe(`var(${token})`);
    }
  });

  it('gives your messages text from their own color', () => {
    const own = declarations(block(`html.${CUSTOM_USER_MESSAGE_CLASS} [data-own-message] {`));
    expect(own['--text-primary-rgb']).toBe('var(--chat-user-message-text-rgb)');
  });

  it('names the three areas for Tailwind from the same variables', () => {
    expect(tailwindConfig).toContain("background: 'rgb(var(--chat-background-rgb) / <alpha-value>)'");
    expect(tailwindConfig).toContain("header: 'rgb(var(--chat-header-rgb) / <alpha-value>)'");
    expect(tailwindConfig).toContain("'user-message': 'rgb(var(--chat-user-message-rgb) / <alpha-value>)'");
  });
});

// The rules above match on markers in the markup. A menu that opens out of the
// header without one shows the bar's text on its own surface — white on white
// with a light header in the light theme — and nothing else would catch it.
import chatPage from '../../pages/ChatPage/index.tsx?raw';
import sessionMenu from '../../pages/ChatPage/SessionHeader/SessionDropdown/DropdownMenu.tsx?raw';
import workingDirMenu from '../../pages/ChatPage/SessionHeader/WorkingDirDropdown/WorkingDirMenu.tsx?raw';
import overflowMenu from '../../pages/ChatPage/SessionHeader/dock/OverflowMenu.tsx?raw';
import accountMenu from '../../pages/ChatPage/SessionHeader/AccountSwitcher/AccountSwitcherMenu.tsx?raw';

describe('chat colors — the markers the rules key off', () => {
  it('marks the header bar and paints it with its own color', () => {
    expect(chatPage).toMatch(/<div data-chat-header className="[^"]*\bbg-chat-header\b/);
  });

  it('marks every menu that opens out of the header', () => {
    for (const [name, source] of Object.entries({ sessionMenu, workingDirMenu, overflowMenu, accountMenu })) {
      expect(source, name).toContain('data-header-menu');
    }
  });

  it('paints the chat and the fade under a pinned message with the background color', () => {
    expect(chatPage).not.toMatch(/\bbg-surface-base\b/);
    expect(chatPage.match(/\bbg-chat-background\b/g)?.length).toBe(2);
  });
});
