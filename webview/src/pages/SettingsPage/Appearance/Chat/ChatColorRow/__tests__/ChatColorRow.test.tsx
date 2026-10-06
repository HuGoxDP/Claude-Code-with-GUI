/**
 * The color rows under Settings → Appearance → Chat: what each control saves,
 * and when. The colors reaching the chat is covered by utils/chatColors.test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { SettingKey } from '@/types/settings';

const updateSettingMock = vi.fn();
const resetToGlobalMock = vi.fn();
let mockScopeSettings: Record<string, unknown> = {};
let mockScope: 'global' | 'project' = 'global';
let mockIsDark = true;

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({
    scopeSettings: mockScopeSettings,
    settings: mockScopeSettings,
    updateSetting: updateSettingMock,
    resetToGlobal: resetToGlobalMock,
    scope: mockScope,
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ isDark: mockIsDark }),
}));

import { ChatColorArea, ChatColorRow } from '../index';

beforeEach(() => {
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
  mockScopeSettings = {};
  mockScope = 'global';
  mockIsDark = true;
});

const hexField = () => screen.getByRole('textbox', { name: 'Color code' });

describe('ChatColorRow', () => {
  it('saves a preset as it is clicked, and marks the one in use', () => {
    const { rerender } = render(<ChatColorRow area={ChatColorArea.Header} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use #1e3a5f' }));
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.HEADER_BAR_COLOR, '#1e3a5f');

    mockScopeSettings = { [SettingKey.HEADER_BAR_COLOR]: '#1e3a5f' };
    rerender(<ChatColorRow area={ChatColorArea.Header} />);
    expect(screen.getByRole('button', { name: 'Use #1e3a5f' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers the presets of the palette on screen', () => {
    mockIsDark = false;
    render(<ChatColorRow area={ChatColorArea.Background} />);
    expect(screen.getByRole('button', { name: 'Use #faf4ed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use #282c34' })).toBeNull();
  });

  it('keeps the background per palette: the light theme edits its own and leaves the dark one', () => {
    // The theme's text stays on the background, so the dark color must never
    // follow the user into the light theme.
    mockIsDark = false;
    mockScopeSettings = { [SettingKey.CHAT_BACKGROUND_COLOR_DARK]: '#282c34' };
    render(<ChatColorRow area={ChatColorArea.Background} />);
    expect(hexField()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Use #faf4ed' }));
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.CHAT_BACKGROUND_COLOR_LIGHT, '#faf4ed');
  });

  it('uses one color for the header in both palettes, its text adapting instead', () => {
    mockIsDark = false;
    mockScopeSettings = { [SettingKey.HEADER_BAR_COLOR]: '#1e3a5f' };
    render(<ChatColorRow area={ChatColorArea.Header} />);
    expect(hexField()).toHaveValue('#1e3a5f');
  });

  it('goes back to the theme with Theme', () => {
    mockScopeSettings = { [SettingKey.USER_MESSAGE_COLOR]: '#005fb8' };
    render(<ChatColorRow area={ChatColorArea.UserMessage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.USER_MESSAGE_COLOR, null);
  });

  it('saves a typed code when focus leaves, lowercased, and not before', () => {
    render(<ChatColorRow area={ChatColorArea.Background} />);
    fireEvent.change(hexField(), { target: { value: '#1E1F22' } });
    expect(updateSettingMock).not.toHaveBeenCalled();
    fireEvent.blur(hexField());
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.CHAT_BACKGROUND_COLOR_DARK, '#1e1f22');
  });

  it('drops a code that is not a color and shows the stored one again', () => {
    mockScopeSettings = { [SettingKey.CHAT_BACKGROUND_COLOR_DARK]: '#282c34' };
    render(<ChatColorRow area={ChatColorArea.Background} />);
    fireEvent.change(hexField(), { target: { value: '#28' } });
    expect(hexField()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.blur(hexField());
    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(hexField()).toHaveValue('#282c34');
  });

  it('reads an emptied field as "the theme" globally and "not set" in a project', () => {
    mockScopeSettings = { [SettingKey.HEADER_BAR_COLOR]: '#1e3a5f' };
    const { unmount } = render(<ChatColorRow area={ChatColorArea.Header} />);
    fireEvent.change(hexField(), { target: { value: '' } });
    fireEvent.blur(hexField());
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.HEADER_BAR_COLOR, null);
    unmount();

    updateSettingMock.mockReset();
    mockScope = 'project';
    render(<ChatColorRow area={ChatColorArea.Header} />);
    fireEvent.change(hexField(), { target: { value: '' } });
    fireEvent.blur(hexField());
    expect(resetToGlobalMock).toHaveBeenCalledWith(SettingKey.HEADER_BAR_COLOR);
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('says "Not set" in a project that leaves the color to the global one', () => {
    mockScope = 'project';
    render(<ChatColorRow area={ChatColorArea.Header} />);
    expect(hexField()).toHaveAttribute('placeholder', 'Not set');
    // Theme is a choice of its own here, not the absence of one.
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the system picker only where it lands, not every step of a drag', () => {
    render(<ChatColorRow area={ChatColorArea.UserMessage} />);
    const picker = screen.getByLabelText('Pick a color') as HTMLInputElement;
    fireEvent.input(picker, { target: { value: '#112233' } });
    fireEvent.input(picker, { target: { value: '#223344' } });
    expect(updateSettingMock).not.toHaveBeenCalled();
    act(() => {
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(updateSettingMock).toHaveBeenCalledTimes(1);
    expect(updateSettingMock).toHaveBeenCalledWith(SettingKey.USER_MESSAGE_COLOR, '#223344');
  });

  it('warns when the theme text would read poorly on a chat background', () => {
    mockScopeSettings = { [SettingKey.CHAT_BACKGROUND_COLOR_DARK]: '#f5f5f5' };
    const { rerender } = render(<ChatColorRow area={ChatColorArea.Background} />);
    expect(screen.getByText("The theme's text may be hard to read on this color.")).toBeInTheDocument();

    mockScopeSettings = { [SettingKey.CHAT_BACKGROUND_COLOR_DARK]: '#282c34' };
    rerender(<ChatColorRow area={ChatColorArea.Background} />);
    expect(screen.queryByText("The theme's text may be hard to read on this color.")).toBeNull();
  });

  it('does not warn for the header or your messages, whose text follows the color', () => {
    mockScopeSettings = { [SettingKey.HEADER_BAR_COLOR]: '#f5f5f5' };
    render(<ChatColorRow area={ChatColorArea.Header} />);
    expect(screen.queryByText("The theme's text may be hard to read on this color.")).toBeNull();
  });
});
