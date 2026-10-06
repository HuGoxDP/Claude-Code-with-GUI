/**
 * The chat color rows are i18n-facing: a missing translation shows a raw key
 * in the row, and the presets' names are built from `use` with a color in it.
 */
import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n/config';

const locales: string[] = Object.keys(resources);

function chatColorsOf(locale: string): Record<string, any> {
  return (resources[locale].settings as Record<string, any>).appearance?.chatColors;
}

describe('chat colors setting i18n', () => {
  it('translates every string in every locale', () => {
    expect(locales.length).toBeGreaterThanOrEqual(12);
    for (const locale of locales) {
      const strings = chatColorsOf(locale);
      for (const area of ['background', 'header', 'userMessage']) {
        expect(strings?.[area]?.label, `${locale}.${area}.label`).toBeTruthy();
        expect(strings?.[area]?.description, `${locale}.${area}.description`).toBeTruthy();
      }
      for (const key of ['theme', 'themeHint', 'pick', 'hex', 'use', 'notSet', 'lowContrast']) {
        expect(strings?.[key], `${locale}.${key}`).toBeTruthy();
      }
      expect(strings.use, `${locale}.use`).toContain('{{color}}');
    }
  });

  it('is actually translated, not English copied over', () => {
    const en = chatColorsOf('en').header.description;
    for (const locale of locales.filter((l) => l !== 'en')) {
      expect(chatColorsOf(locale).header.description, locale).not.toBe(en);
    }
  });
});
