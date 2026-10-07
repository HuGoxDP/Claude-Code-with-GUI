import { DiffTheme } from '@/types/settings';

/**
 * Which palette the diffs in the chat take (ported from CC GUI's "Diff Theme").
 *
 * The answer goes on <html> as `data-diff-theme`, and index.css repaints every
 * element marked `diff-surface` (the edit cards, the diff viewer) from it. No
 * attribute means the chat theme's own diff colours, which is what "follow" is,
 * so choosing it restores exactly the look there was before this setting.
 */
export type DiffPalette = 'light' | 'dark' | 'soft-dark';

/**
 * The palette for [setting], or null to keep the chat theme's.
 *
 * [ideTheme] is the IDE's lightness, or null outside the IDE or before the IDE
 * has said; "ide" then follows the chat theme, the only theme there is to follow.
 */
export function resolveDiffPalette(setting: unknown, ideTheme: 'light' | 'dark' | null): DiffPalette | null {
  switch (setting) {
    case DiffTheme.LIGHT:
      return 'light';
    case DiffTheme.SOFT_DARK:
      return 'soft-dark';
    case DiffTheme.IDE:
      return ideTheme;
    default:
      return null;
  }
}

/** Put [palette] on <html>, or take it off for the chat theme's own colours. */
export function applyDiffPalette(palette: DiffPalette | null, root: HTMLElement = document.documentElement): void {
  if (palette) root.setAttribute('data-diff-theme', palette);
  else root.removeAttribute('data-diff-theme');
}
