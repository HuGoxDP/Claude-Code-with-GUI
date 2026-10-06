/**
 * Colors of your own for three areas of the chat (Settings → Appearance →
 * Chat), ported from CC GUI's chat background, header bar and user message
 * colors.
 *
 * A color is stored as `#rrggbb` and handed to CSS as an `r g b` triplet: every
 * color here is consumed as `rgb(var(--x-rgb) / <alpha>)` so Tailwind's opacity
 * modifiers keep working. Unset, each area follows the theme through the
 * defaults in index.css; set, the values below land as inline properties on
 * <html>, which outrank the stylesheet.
 *
 * The header and your messages also get text that reads on the color: black or
 * white, whichever contrasts more, with the quieter shades and the hover and
 * border colors mixed from the two. Without it a light color in the dark theme
 * (or the reverse) leaves light text on a light bar. The chat background does
 * not: its text is the whole transcript, and recoloring that is a theme, not a
 * background. It is kept per palette instead, so the light theme's dark text
 * never lands on a color chosen for the dark one, and the settings row warns
 * when the theme's text reads poorly on it.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The text colors a colored area can switch to (the same pair as CC GUI). */
const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#1f2328';

type Rgb = [number, number, number];

/** Whether a stored value is a color this feature applies. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function hexToRgb(color: string): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function toTriplet([r, g, b]: Rgb): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

/** `#1e1f22` → `30 31 34`, the form the CSS variables take. */
export function hexToTriplet(color: string): string {
  return toTriplet(hexToRgb(color));
}

/** `30 31 34` (as `getComputedStyle` reports a triplet variable) → its channels. */
export function parseTriplet(value: string): Rgb | null {
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as Rgb;
}

/** `base` moved toward `overlay` by `ratio` (0 = base, 1 = overlay). */
function mix(base: Rgb, overlay: Rgb, ratio: number): Rgb {
  return base.map((channel, i) => channel * (1 - ratio) + overlay[i] * ratio) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableTextFor(background: string): string {
  const bg = hexToRgb(background);
  return contrastRatio(bg, hexToRgb(LIGHT_TEXT)) >= contrastRatio(bg, hexToRgb(DARK_TEXT))
    ? LIGHT_TEXT
    : DARK_TEXT;
}

/**
 * Below this the theme's text on a custom chat background gets a warning. 3:1
 * is the WCAG floor for large text; body text wants 4.5, but a warning on every
 * slightly-off shade would teach people to ignore it.
 */
export const LOW_CONTRAST_RATIO = 3;

/** The inline properties for a colored area that also recolors its text. */
function paletteFor(prefix: string, color: string): Record<string, string> {
  const bg = hexToRgb(color);
  const text = hexToRgb(readableTextFor(color));
  return {
    [`${prefix}-rgb`]: toTriplet(bg),
    [`${prefix}-text-rgb`]: toTriplet(text),
    [`${prefix}-text-secondary-rgb`]: toTriplet(mix(bg, text, 0.72)),
    [`${prefix}-text-tertiary-rgb`]: toTriplet(mix(bg, text, 0.55)),
    [`${prefix}-hover-rgb`]: toTriplet(mix(bg, text, 0.08)),
    [`${prefix}-pressed-rgb`]: toTriplet(mix(bg, text, 0.14)),
    [`${prefix}-border-rgb`]: toTriplet(mix(bg, text, 0.24)),
  };
}

export interface ChatColors {
  backgroundDark: string | null;
  backgroundLight: string | null;
  header: string | null;
  userMessage: string | null;
}

/** The class on <html> that switches an area's text tokens to its own. */
export const CUSTOM_HEADER_CLASS = 'custom-chat-header';
export const CUSTOM_USER_MESSAGE_CLASS = 'custom-user-message';

/** Every inline property this module may set, so clearing one area clears all of it. */
const AREA_PROPERTIES = {
  backgroundDark: ['--chat-background-dark-rgb'],
  backgroundLight: ['--chat-background-light-rgb'],
  header: Object.keys(paletteFor('--chat-header', '#000000')),
  userMessage: Object.keys(paletteFor('--chat-user-message', '#000000')),
} as const;

/**
 * Puts the colors on `root` (normally <html>), or takes them off. A value that
 * is not `#rrggbb` counts as unset: the backend refuses to store one, but a
 * hand-edited settings file is read as it is.
 */
export function applyChatColors(colors: ChatColors, root: HTMLElement = document.documentElement): void {
  const set = (properties: Record<string, string>) => {
    for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
  };
  const clear = (names: readonly string[]) => {
    for (const name of names) root.style.removeProperty(name);
  };

  // Both palettes' backgrounds at once; index.css reads the one on screen.
  if (isHexColor(colors.backgroundDark)) set({ '--chat-background-dark-rgb': hexToTriplet(colors.backgroundDark) });
  else clear(AREA_PROPERTIES.backgroundDark);
  if (isHexColor(colors.backgroundLight)) set({ '--chat-background-light-rgb': hexToTriplet(colors.backgroundLight) });
  else clear(AREA_PROPERTIES.backgroundLight);

  const header = isHexColor(colors.header);
  if (header) set(paletteFor('--chat-header', colors.header as string));
  else clear(AREA_PROPERTIES.header);
  root.classList.toggle(CUSTOM_HEADER_CLASS, header);

  const userMessage = isHexColor(colors.userMessage);
  if (userMessage) set(paletteFor('--chat-user-message', colors.userMessage as string));
  else clear(AREA_PROPERTIES.userMessage);
  root.classList.toggle(CUSTOM_USER_MESSAGE_CLASS, userMessage);
}
