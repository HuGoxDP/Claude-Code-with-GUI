/**
 * The streaming switch under Settings → Appearance → Chat. What it does to the
 * CLI is covered by the backend's claude-process tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey } from '@/types/settings';
import { resources } from '@/i18n/config';

const updateSettingMock = vi.fn();
let mockScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    settings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: 'global',
  }),
}));

import { StreamingRow } from '../StreamingRow';

beforeEach(() => {
  updateSettingMock.mockReset();
  mockScopeSettings = {};
});

describe('StreamingRow', () => {
  it('reads unset as on, the way the chat always streamed', () => {
    render(<StreamingRow />);
    expect(screen.getByRole('switch', { name: 'Stream replies' })).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the new value as it is flipped', () => {
    render(<StreamingRow />);
    fireEvent.click(screen.getByRole('switch', { name: 'Stream replies' }));
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.STREAMING, false);
  });

  it('shows off when the setting is false', () => {
    mockScopeSettings = { [SettingKey.STREAMING]: false };
    render(<StreamingRow />);
    expect(screen.getByRole('switch', { name: 'Stream replies' })).toHaveAttribute('aria-checked', 'false');
  });

  it('is translated in every locale', () => {
    const en = (resources.en.settings as any).appearance.streaming;
    for (const locale of Object.keys(resources)) {
      const strings = (resources[locale].settings as any).appearance?.streaming;
      expect(strings?.label, locale).toBeTruthy();
      expect(strings?.description, locale).toBeTruthy();
      if (locale !== 'en') expect(strings.description, locale).not.toBe(en.description);
    }
  });
});
