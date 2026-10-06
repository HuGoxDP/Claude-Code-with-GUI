/** The Expand diffs switch under Settings → Appearance → Chat. */
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

import { ExpandDiffsRow } from '../ExpandDiffsRow';

beforeEach(() => {
  updateSettingMock.mockReset();
  mockScopeSettings = {};
});

describe('ExpandDiffsRow', () => {
  it('reads unset as on and saves the flip', () => {
    render(<ExpandDiffsRow />);
    const sw = screen.getByRole('switch', { name: 'Expand diffs' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.EXPAND_DIFFS, false);
  });

  it('is translated in every locale, with the card captions', () => {
    for (const locale of Object.keys(resources)) {
      const row = (resources[locale].settings as any).appearance?.expandDiffs;
      const edit = (resources[locale].chatTools as any).edit;
      expect(row?.label, locale).toBeTruthy();
      expect(row?.description, locale).toBeTruthy();
      expect(edit?.showChanges, locale).toBeTruthy();
      expect(edit?.hideChanges, locale).toBeTruthy();
    }
  });
});
