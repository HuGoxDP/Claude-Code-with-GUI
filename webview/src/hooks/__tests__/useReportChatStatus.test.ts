import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MessageType } from '@/shared';

const sendRaw = vi.fn();
let connectionHandler: ((connected: boolean) => void) | null = null;
let inJetBrains = true;
let sessionTitle: string | null = 'Fix the login form';
let usage: { totalTokens: number; contextWindow: number; maxOutputTokens: number } | null = null;

vi.mock('@/api/bridge/Bridge', () => ({
  getBridge: () => ({
    sendRaw,
    onConnectionChange: (handler: (connected: boolean) => void) => {
      connectionHandler = handler;
      return () => {
        connectionHandler = null;
      };
    },
  }),
}));
vi.mock('@/api/bridge/resolvePanelId', () => ({ resolvePanelId: () => 'panel-1' }));
vi.mock('@/config/environment', () => ({ isJetBrains: () => inJetBrains }));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSession: sessionTitle ? { title: sessionTitle } : null, inputMode: 'plan' }),
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ contextWindowUsage: usage }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ workingDirectory: '/proj' }),
}));
vi.mock('../useCurrentModelLabel', () => ({
  useCurrentModelLabel: () => ({ models: [], currentModel: 'sonnet', info: null, label: 'Sonnet' }),
}));

import { useReportChatStatus } from '../useReportChatStatus';

type Payload = { panelId: string; workingDir?: string; focused: boolean; text: string | null; tooltip: string | null };

function payloads(): Payload[] {
  return sendRaw.mock.calls
    .map((call) => call[0] as { type: string; payload: Payload })
    .filter((message) => message.type === MessageType.SET_CHAT_STATUS)
    .map((message) => message.payload);
}

beforeEach(() => {
  sendRaw.mockClear();
  connectionHandler = null;
  inJetBrains = true;
  sessionTitle = 'Fix the login form';
  usage = null;
});

/**
 * The chat page tells the IDE what its status bar should say (B6). Reported on
 * every change, on every move into the panel, and cleared when the chat screen
 * goes away.
 */
describe('useReportChatStatus', () => {
  it('reports the chat on mount, with the model and mode in the tooltip', () => {
    renderHook(() => useReportChatStatus(false, false));

    const [first] = payloads();
    expect(first).toMatchObject({ panelId: 'panel-1', workingDir: '/proj', text: 'Claude' });
    expect(first.tooltip).toContain('Fix the login form');
    expect(first.tooltip).toContain('Sonnet');
    expect(first.tooltip).toContain('Plan mode');
  });

  it('reports again when the chat starts working, and when the context is known', () => {
    const { rerender } = renderHook(({ streaming }) => useReportChatStatus(streaming, false), {
      initialProps: { streaming: false },
    });
    usage = { totalTokens: 68000, contextWindow: 200000, maxOutputTokens: 32000 };
    rerender({ streaming: true });

    const all = payloads();
    const last = all[all.length - 1];
    expect(last.text).toMatch(/^Claude: .+ · \d+% /);
  });

  it('claims the bar when the user clicks into the panel', () => {
    renderHook(() => useReportChatStatus(false, false));
    sendRaw.mockClear();

    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
    });

    expect(payloads()).toEqual([expect.objectContaining({ focused: true, text: 'Claude' })]);
  });

  it('reports again after a reconnect, for a backend that restarted', () => {
    renderHook(() => useReportChatStatus(false, false));
    sendRaw.mockClear();

    act(() => connectionHandler?.(true));

    expect(payloads()).toHaveLength(1);
  });

  it('says there is nothing to show when the chat screen goes away', () => {
    const { unmount } = renderHook(() => useReportChatStatus(false, false));
    sendRaw.mockClear();

    unmount();

    expect(payloads()).toEqual([expect.objectContaining({ panelId: 'panel-1', focused: false, text: null, tooltip: null })]);
  });

  it('says nothing in a browser, which has no status bar', () => {
    inJetBrains = false;
    const { unmount } = renderHook(() => useReportChatStatus(true, false));
    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
    });
    unmount();

    expect(payloads()).toEqual([]);
  });
});
