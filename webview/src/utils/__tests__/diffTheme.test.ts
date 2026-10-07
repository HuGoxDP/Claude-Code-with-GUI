import { describe, it, expect } from 'vitest';
import { DiffTheme } from '@/types/settings';
import { applyDiffPalette, resolveDiffPalette } from '../diffTheme';

/**
 * The diff theme setting picks one palette, or none, which keeps the chat
 * theme's own colours: "follow" must leave the look exactly as it was.
 */
describe('resolveDiffPalette', () => {
  it('keeps the chat theme for follow, and for anything it does not know', () => {
    expect(resolveDiffPalette(DiffTheme.FOLLOW, 'dark')).toBeNull();
    expect(resolveDiffPalette(undefined, 'dark')).toBeNull();
    expect(resolveDiffPalette('neon', 'light')).toBeNull();
  });

  it('gives the fixed palettes whatever the IDE is', () => {
    expect(resolveDiffPalette(DiffTheme.LIGHT, 'dark')).toBe('light');
    expect(resolveDiffPalette(DiffTheme.SOFT_DARK, 'light')).toBe('soft-dark');
  });

  it('follows the IDE lightness for ide, and the chat theme when there is no IDE to follow', () => {
    expect(resolveDiffPalette(DiffTheme.IDE, 'dark')).toBe('dark');
    expect(resolveDiffPalette(DiffTheme.IDE, 'light')).toBe('light');
    expect(resolveDiffPalette(DiffTheme.IDE, null)).toBeNull();
  });
});

describe('applyDiffPalette', () => {
  it('puts the palette on the root, and takes it off for the chat theme', () => {
    const root = document.createElement('html');
    applyDiffPalette('soft-dark', root);
    expect(root.getAttribute('data-diff-theme')).toBe('soft-dark');
    applyDiffPalette(null, root);
    expect(root.hasAttribute('data-diff-theme')).toBe(false);
  });
});
