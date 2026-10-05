import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelInfo } from '@/types/slashCommand';

const updateSettingMock = vi.fn();
let mockSettings: Record<string, unknown> = {};
let mockScopeSettings: Record<string, unknown> = {};
let mockScope = 'user';
let mockModels: ModelInfo[] = [];
let mockSessionModel: string | null = null;

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({
    settings: mockSettings,
    scopeSettings: mockScopeSettings,
    updateSetting: updateSettingMock,
    scope: mockScope,
  }),
  useClaudeSettingsOrNull: () => null,
}));

const updateGuiSettingMock = vi.fn();
let mockGuiScopeSettings: Record<string, unknown> = {};
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: mockGuiScopeSettings,
    scopeSettings: mockGuiScopeSettings,
    updateSetting: updateGuiSettingMock,
    resetToGlobal: vi.fn(),
    scope: 'user',
  }),
  useSettingsOrNull: () => null,
}));

vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({
    controlResponse: { response: { response: { models: mockModels } } },
  }),
}));

vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sessionModel: mockSessionModel }),
}));

import { PermissionsSettings } from '../index';

const AUTO_MODEL: ModelInfo = ModelInfo.from({
  value: 'sonnet',
  displayName: 'Sonnet',
  description: 'Sonnet',
  supportsAutoMode: true,
});
const NO_AUTO_MODEL: ModelInfo = ModelInfo.from({
  value: 'haiku',
  displayName: 'Haiku',
  description: 'Haiku',
  supportsAutoMode: false,
});

/**
 * Open the "Default Input Mode" dropdown and read the labels it offers. The
 * selected option renders a trailing check marker, so compare on the label only.
 */
function openDefaultModeOptions(): string[] {
  fireEvent.click(screen.getByRole('button', { name: /Default Input Mode/i }));
  return screen.getAllByRole('option').map((o) => (o.textContent ?? '').replace(/✓/g, '').trim());
}

beforeEach(() => {
  updateSettingMock.mockReset();
  updateGuiSettingMock.mockReset();
  mockGuiScopeSettings = {};
  mockSettings = {};
  mockScopeSettings = {};
  mockScope = 'user';
  mockModels = [AUTO_MODEL, NO_AUTO_MODEL];
  mockSessionModel = 'sonnet';
});

describe('PermissionsSettings — default mode offers auto (#272)', () => {
  it('offers Auto mode when the current model supports it', () => {
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).toContain('Auto mode');
  });

  it('hides Auto mode when the current model does not support it', () => {
    mockSessionModel = 'haiku';
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).not.toContain('Auto mode');
  });

  it('hides Auto mode when admin policy disables it, even on a supporting model', () => {
    mockSettings = { permissions: { disableAutoMode: 'disable' } };
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).not.toContain('Auto mode');
  });

  it('keeps Auto mode listed when it is the saved value but model info has not arrived', () => {
    // Empty catalog => availability unknown. A saved auto must stay listed,
    // otherwise the dropdown silently drops the user's stored value.
    mockModels = [];
    mockSessionModel = null;
    mockScopeSettings = { permissions: { defaultMode: 'auto' } };
    render(<PermissionsSettings />);
    expect(openDefaultModeOptions()).toContain('Auto mode');
  });

  it('persists Auto mode as the CLI defaultMode flag when picked', () => {
    render(<PermissionsSettings />);
    openDefaultModeOptions();
    fireEvent.click(screen.getByRole('option', { name: 'Auto mode' }));
    expect(updateSettingMock).toHaveBeenCalledWith(
      'permissions',
      expect.objectContaining({ defaultMode: 'auto' }),
    );
  });
});

describe('PermissionsSettings — prompt timeout', () => {
  it('is off until set, and stores the chosen number of seconds', () => {
    render(<PermissionsSettings />);
    const select = screen.getByRole('button', { name: /Decline automatically after/i });
    expect(select.textContent).toContain('Off');
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: /^5 minutes/ }));
    expect(updateGuiSettingMock).toHaveBeenCalledWith('promptTimeoutSeconds', 300);
  });

  it('turns it off again with null', () => {
    mockGuiScopeSettings = { promptTimeoutSeconds: 300 };
    render(<PermissionsSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Decline automatically after/i }));
    fireEvent.click(screen.getByRole('option', { name: /^Off/ }));
    expect(updateGuiSettingMock).toHaveBeenCalledWith('promptTimeoutSeconds', null);
  });
});
