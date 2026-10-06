/**
 * Colors of your own for the chat background, header bar and your messages.
 * The only way a stored color reaches the screen is the inline properties and
 * classes this puts on <html>; index.css reads them and nothing else does.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyChatColors,
  contrastRatio,
  CUSTOM_HEADER_CLASS,
  CUSTOM_USER_MESSAGE_CLASS,
  hexToTriplet,
  isHexColor,
  parseTriplet,
  readableTextFor,
} from '../chatColors';

const NONE = { backgroundDark: null, backgroundLight: null, header: null, userMessage: null };

describe('chat colors', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('html');
  });

  it('accepts only #rrggbb', () => {
    expect(isHexColor('#1e1f22')).toBe(true);
    expect(isHexColor('#A0B1C2')).toBe(true);
    for (const value of ['#fff', '#11223344', 'red', '1e1f22', '', null, undefined, 7]) {
      expect(isHexColor(value), String(value)).toBe(false);
    }
  });

  it('turns a color into the triplet the CSS variables hold, and back', () => {
    expect(hexToTriplet('#1e1f22')).toBe('30 31 34');
    expect(parseTriplet(' 30 31 34')).toEqual([30, 31, 34]);
    expect(parseTriplet('')).toBeNull();
    expect(parseTriplet('rgb(1, 2, 3)')).toBeNull();
  });

  it('picks the text that reads better: white on dark, near-black on light', () => {
    expect(readableTextFor('#1e3a5f')).toBe('#ffffff');
    expect(readableTextFor('#005fb8')).toBe('#ffffff');
    expect(readableTextFor('#e5f0fb')).toBe('#1f2328');
    expect(readableTextFor('#ffd400')).toBe('#1f2328');
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it('puts each palette\'s background on <html> and takes it off again', () => {
    // Both at once: which one shows is the stylesheet's call (`.dark`), so a
    // theme switch needs nothing from here.
    applyChatColors({ ...NONE, backgroundDark: '#282c34', backgroundLight: '#faf4ed' }, root);
    expect(root.style.getPropertyValue('--chat-background-dark-rgb')).toBe('40 44 52');
    expect(root.style.getPropertyValue('--chat-background-light-rgb')).toBe('250 244 237');
    // Never the variable the components read: that one picks between the two.
    expect(root.style.getPropertyValue('--chat-background-rgb')).toBe('');

    applyChatColors({ ...NONE, backgroundLight: '#faf4ed' }, root);
    expect(root.style.getPropertyValue('--chat-background-dark-rgb')).toBe('');
    expect(root.style.getPropertyValue('--chat-background-light-rgb')).toBe('250 244 237');
  });

  it('gives the header its own text, hover and border, and marks <html> while it has them', () => {
    applyChatColors({ ...NONE, header: '#e5f0fb' }, root);
    expect(root.style.getPropertyValue('--chat-header-rgb')).toBe('229 240 251');
    // Light bar → dark text, and the quieter shades sit between the two.
    expect(root.style.getPropertyValue('--chat-header-text-rgb')).toBe('31 35 40');
    for (const name of ['secondary', 'tertiary']) {
      expect(root.style.getPropertyValue(`--chat-header-text-${name}-rgb`)).not.toBe('');
    }
    for (const name of ['hover', 'pressed', 'border']) {
      expect(root.style.getPropertyValue(`--chat-header-${name}-rgb`)).not.toBe('');
    }
    expect(root.classList.contains(CUSTOM_HEADER_CLASS)).toBe(true);
    // The other areas are untouched.
    expect(root.classList.contains(CUSTOM_USER_MESSAGE_CLASS)).toBe(false);
    expect(root.style.getPropertyValue('--chat-background-dark-rgb')).toBe('');
  });

  it('clears every property of an area, not just its color, when it goes back to the theme', () => {
    // A leftover text token with the class gone would be harmless; with the
    // class still on it would paint text for a bar that is no longer there.
    applyChatColors({ backgroundDark: '#282c34', backgroundLight: '#faf4ed', header: '#1e3a5f', userMessage: '#005fb8' }, root);
    applyChatColors(NONE, root);
    expect(root.getAttribute('style') ?? '').toBe('');
    expect(root.classList.contains(CUSTOM_HEADER_CLASS)).toBe(false);
    expect(root.classList.contains(CUSTOM_USER_MESSAGE_CLASS)).toBe(false);
  });

  it('gives your messages readable text too', () => {
    applyChatColors({ ...NONE, userMessage: '#005fb8' }, root);
    expect(root.style.getPropertyValue('--chat-user-message-rgb')).toBe('0 95 184');
    expect(root.style.getPropertyValue('--chat-user-message-text-rgb')).toBe('255 255 255');
    expect(root.classList.contains(CUSTOM_USER_MESSAGE_CLASS)).toBe(true);
  });

  it('reads a value that is not #rrggbb as unset', () => {
    // The backend refuses one, but a hand-edited settings file is read as is.
    applyChatColors({ backgroundDark: 'red', backgroundLight: '', header: '#fff', userMessage: 'rgb(1,2,3)' }, root);
    expect(root.getAttribute('style') ?? '').toBe('');
    expect(root.classList.contains(CUSTOM_HEADER_CLASS)).toBe(false);
  });
});
