import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resetChatStatusForTests, setChatStatusHandler } from '../setChatStatus';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

function createMockBridge(setChatStatus = vi.fn().mockResolvedValue(undefined)) {
  return { setChatStatus } as unknown as Bridge & { setChatStatus: ReturnType<typeof vi.fn> };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.SET_CHAT_STATUS, payload, timestamp: 0 };
}

async function report(bridge: Bridge, payload: Record<string, unknown>) {
  await setChatStatusHandler('conn-1', message(payload), createMockConnections(), bridge);
}

describe('setChatStatusHandler', () => {
  beforeEach(() => resetChatStatusForTests());

  it('hands the status, the panel and its project to the bridge', async () => {
    const bridge = createMockBridge();

    await report(bridge, {
      panelId: 'p1',
      workingDir: '/proj',
      focused: true,
      text: 'Claude: 34% context',
      tooltip: 'Fix the login\nModel: Sonnet',
    });

    expect(bridge.setChatStatus).toHaveBeenCalledWith({
      panelId: 'p1',
      workingDir: '/proj',
      focused: true,
      status: { text: 'Claude: 34% context', tooltip: 'Fix the login\nModel: Sonnet' },
    });
  });

  it('reads an empty text as nothing to say, and anything but true as not focused', async () => {
    const bridge = createMockBridge();

    await report(bridge, { panelId: 'p1', text: 'Claude', tooltip: '' });
    await report(bridge, { panelId: 'p1', focused: 'yes', text: '   ', tooltip: 'x' });

    expect(bridge.setChatStatus).toHaveBeenLastCalledWith({
      panelId: 'p1',
      workingDir: undefined,
      focused: false,
      status: null,
    });
  });

  it('drops a report with no panel to file it under', async () => {
    const bridge = createMockBridge();

    await report(bridge, { text: 'Claude' });
    await report(bridge, { panelId: '', text: 'Claude' });
    await report(bridge, { panelId: 7, text: 'Claude' });

    expect(bridge.setChatStatus).not.toHaveBeenCalled();
  });

  it('cuts an overlong text and tooltip', async () => {
    const bridge = createMockBridge();

    await report(bridge, { panelId: 'p1', text: 'x'.repeat(500), tooltip: 'y'.repeat(5000) });

    const { status } = bridge.setChatStatus.mock.calls[0][0];
    expect(status.text).toHaveLength(200);
    expect(status.tooltip).toHaveLength(2000);
  });

  it('passes on a click only when it changes the status or which chat has focus', async () => {
    const bridge = createMockBridge();
    const a = { panelId: 'a', focused: true, text: 'Claude: 10% context', tooltip: 'A' };
    const b = { panelId: 'b', focused: true, text: 'Claude: 70% context', tooltip: 'B' };

    await report(bridge, a);
    await report(bridge, a); // a second click in the same chat
    expect(bridge.setChatStatus).toHaveBeenCalledTimes(1);

    await report(bridge, b); // into another chat
    await report(bridge, a); // and back
    expect(bridge.setChatStatus).toHaveBeenCalledTimes(3);

    await report(bridge, { ...b, focused: false }); // b says the same in the background
    expect(bridge.setChatStatus).toHaveBeenCalledTimes(3);

    await report(bridge, { ...b, focused: false, text: 'Claude: working · 70% context' });
    expect(bridge.setChatStatus).toHaveBeenCalledTimes(4);
  });

  it('passes nothing on for a chat that goes quiet before it ever said anything', async () => {
    const bridge = createMockBridge();

    await report(bridge, { panelId: 'a', focused: false, text: null });

    expect(bridge.setChatStatus).not.toHaveBeenCalled();
  });

  it('passes on a chat going quiet once', async () => {
    const bridge = createMockBridge();

    await report(bridge, { panelId: 'a', focused: false, text: 'Claude', tooltip: '' });
    await report(bridge, { panelId: 'a', focused: false, text: null });
    await report(bridge, { panelId: 'a', focused: false, text: null });

    expect(bridge.setChatStatus).toHaveBeenCalledTimes(2);
    expect(bridge.setChatStatus.mock.calls[1][0].status).toBeNull();
  });

  it('logs and carries on when the bridge fails', async () => {
    const bridge = createMockBridge(vi.fn().mockRejectedValue(new Error('no IDE')));

    await expect(report(bridge, { panelId: 'p1', text: 'Claude' })).resolves.toBeUndefined();
  });
});
