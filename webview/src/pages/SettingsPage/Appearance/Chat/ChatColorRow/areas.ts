import { SettingKey } from '@/types/settings';
import { contrastRatio, LOW_CONTRAST_RATIO, parseTriplet } from '@/utils/chatColors';

/** The three areas of the chat that take a color of your own. */
export enum ChatColorArea {
  Background = 'background',
  Header = 'header',
  UserMessage = 'userMessage',
}

export type ChatColorKey =
  | SettingKey.CHAT_BACKGROUND_COLOR_DARK
  | SettingKey.CHAT_BACKGROUND_COLOR_LIGHT
  | SettingKey.HEADER_BAR_COLOR
  | SettingKey.USER_MESSAGE_COLOR;

interface AreaSpec {
  /**
   * Where the color for each palette is kept. The background has one per
   * palette, because its text stays the theme's; the other two switch their
   * text to fit and use the same key for both.
   */
  key: { dark: ChatColorKey; light: ChatColorKey };
  /**
   * Roughly what the theme paints here, for the system picker to open on while
   * no color is set (it needs some `#rrggbb`). Only a starting point: closing
   * the picker without choosing changes nothing.
   */
  themeColor: { dark: string; light: string };
  /** CC GUI's presets for the same area, less its "Default" (Theme here). */
  presets: { dark: string[]; light: string[] };
}

export const CHAT_COLOR_AREAS: Record<ChatColorArea, AreaSpec> = {
  [ChatColorArea.Background]: {
    key: { dark: SettingKey.CHAT_BACKGROUND_COLOR_DARK, light: SettingKey.CHAT_BACKGROUND_COLOR_LIGHT },
    themeColor: { dark: '#1a1a1a', light: '#ffffff' },
    presets: {
      dark: ['#1a1b26', '#282c34', '#2b2d30', '#0d1117', '#1e1f29', '#262335', '#292d3e'],
      light: ['#fafafa', '#f5f5f5', '#faf4ed', '#f6f8fa', '#fffbf0', '#f0f4f8', '#f5f0eb'],
    },
  },
  [ChatColorArea.Header]: {
    key: { dark: SettingKey.HEADER_BAR_COLOR, light: SettingKey.HEADER_BAR_COLOR },
    themeColor: { dark: '#1a1a1a', light: '#ffffff' },
    presets: {
      dark: ['#1e3a5f', '#263f36', '#3b3151', '#4a3428', '#3f2b36', '#243b4a', '#3b3b3b'],
      light: ['#e5f0fb', '#e5f2e9', '#eee8f7', '#f6ebe3', '#f7e8ee', '#e4f1f3', '#e8e8e8'],
    },
  },
  [ChatColorArea.UserMessage]: {
    key: { dark: SettingKey.USER_MESSAGE_COLOR, light: SettingKey.USER_MESSAGE_COLOR },
    themeColor: { dark: '#2a2a2d', light: '#f5f5f5' },
    presets: {
      dark: ['#005fb8', '#1a7f37', '#6e40c9', '#9a6700', '#cf222e', '#0e6b8a', '#4a5568'],
      light: ['#0078d4', '#1a7f37', '#8250df', '#bf8700', '#cf222e', '#0e8a9a', '#57606a'],
    },
  },
};

/**
 * Whether the theme's text reads poorly on `color` as a chat background. The
 * text color is the one in effect (IDE theme sync included) when the page can
 * report it, and the palette's own otherwise.
 */
export function isLowContrastBackground(color: string, isDark: boolean): boolean {
  const inEffect = parseTriplet(
    getComputedStyle(document.documentElement).getPropertyValue('--theme-text-primary-rgb'),
  );
  const text = inEffect ?? (isDark ? [255, 255, 255] : [30, 30, 30]);
  const background = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  return contrastRatio(background as [number, number, number], text as [number, number, number]) < LOW_CONTRAST_RATIO;
}
