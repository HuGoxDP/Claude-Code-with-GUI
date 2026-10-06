/**
 * The chat colors (Settings → Appearance → Chat) reach the screen only through
 * the properties SettingsContext puts on <html>. If this effect stops firing,
 * the rows keep saving and nothing changes colour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '../SettingsContext';
import { SettingKey } from '@/types/settings';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

const mockSend = vi.fn(() => new Promise(() => { /* never resolves */ }));
const mockSubscribe = vi.fn(() => () => { /* unsubscribe noop */ });

vi.mock('../BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: false, send: mockSend, subscribe: mockSubscribe }),
}));

vi.mock('../WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: '/test/workspace', setWorkingDirectory: vi.fn() }),
}));

const STORAGE_KEY = 'claude-code-settings';

function renderWith(settings: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SettingsProvider>
        <div />
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

function reset() {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  document.documentElement.classList.remove('custom-chat-header', 'custom-user-message');
}

beforeEach(reset);
afterEach(reset);

describe('SettingsContext — chat colors on <html>', () => {
  it('applies each color that is set', async () => {
    renderWith({
      [SettingKey.CHAT_BACKGROUND_COLOR_DARK]: '#282c34',
      [SettingKey.CHAT_BACKGROUND_COLOR_LIGHT]: '#faf4ed',
      [SettingKey.HEADER_BAR_COLOR]: '#1e3a5f',
      [SettingKey.USER_MESSAGE_COLOR]: '#005fb8',
    });
    const root = document.documentElement;
    await waitFor(() => expect(root.style.getPropertyValue('--chat-background-dark-rgb')).toBe('40 44 52'));
    expect(root.style.getPropertyValue('--chat-background-light-rgb')).toBe('250 244 237');
    expect(root.style.getPropertyValue('--chat-header-rgb')).toBe('30 58 95');
    expect(root.style.getPropertyValue('--chat-user-message-rgb')).toBe('0 95 184');
    expect(root.classList.contains('custom-chat-header')).toBe(true);
    expect(root.classList.contains('custom-user-message')).toBe(true);
  });

  it('leaves <html> alone when nothing is set, so the theme decides', async () => {
    document.documentElement.style.setProperty('--chat-header-rgb', '1 2 3');
    document.documentElement.classList.add('custom-chat-header');
    renderWith({});
    await waitFor(() => expect(document.documentElement.classList.contains('custom-chat-header')).toBe(false));
    expect(document.documentElement.style.getPropertyValue('--chat-header-rgb')).toBe('');
  });
});
