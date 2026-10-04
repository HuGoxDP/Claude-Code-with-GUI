import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey } from '@/types/settings';

const updateSettingMock = vi.fn();
let mockScopeSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: 'global',
  }),
}));

import { AiSessionTitlesRow } from '../AiSessionTitlesRow';

beforeEach(() => {
  updateSettingMock.mockReset();
  mockScopeSettings = {};
});

const toggle = () => screen.getByRole('switch', { name: 'AI session titles' });

describe('AiSessionTitlesRow', () => {
  it('reads as on when the setting is absent, the default', () => {
    render(<AiSessionTitlesRow />);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('reflects a saved false', () => {
    mockScopeSettings = { aiSessionTitles: false };
    render(<AiSessionTitlesRow />);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('saves as soon as it is flipped', () => {
    render(<AiSessionTitlesRow />);
    fireEvent.click(toggle());
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.AI_SESSION_TITLES, false);
  });
});
