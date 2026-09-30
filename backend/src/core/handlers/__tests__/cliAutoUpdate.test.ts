import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType } from '../../../shared';

const mocks = vi.hoisted(() => ({
  triggerNow: vi.fn(),
  saveAutoUpdate: vi.fn(),
  saveTraffic: vi.fn(),
  autoUpdateState: vi.fn(),
  trafficState: vi.fn(),
}));
vi.mock('../../cli-auto-update', () => ({ triggerCliAutoUpdateNow: mocks.triggerNow }));
vi.mock('../../claude', () => ({ Claude: { applyConfigDir: vi.fn(async () => {}) } }));
vi.mock('../../features/claude-settings', () => ({
  readMergedClaudeSettings: vi.fn(async () => ({ settings: {}, overrides: [] })),
}));
vi.mock('../../features/cli-auto-update-setting', () => ({
  saveCliAutoUpdate: mocks.saveAutoUpdate,
  saveNonessentialTraffic: mocks.saveTraffic,
  readCliAutoUpdateState: mocks.autoUpdateState,
  readNonessentialTrafficState: mocks.trafficState,
}));

import { setCliAutoUpdateHandler, setNonessentialTrafficHandler } from '../cliAutoUpdate';

const connections = { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
const bridge = {} as Bridge;
const message = (type: MessageType, payload: Record<string, unknown>) => ({ type, payload, requestId: 'r1', timestamp: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveAutoUpdate.mockResolvedValue({ status: 'ok' });
  mocks.saveTraffic.mockResolvedValue({ status: 'ok' });
  mocks.trafficState.mockResolvedValue({ disabled: false, lock: null, settingsPath: '' });
});

/** Turning auto-updates on in Settings checks at once instead of at the next chat. */
describe('checking when the user turns auto-updates on', () => {
  it('checks when the About switch turns them on', async () => {
    mocks.autoUpdateState.mockResolvedValue({ enabled: true, lock: null });
    await setCliAutoUpdateHandler('c1', message(MessageType.SET_CLI_AUTO_UPDATE, { enabled: true }), connections, bridge);
    expect(mocks.triggerNow).toHaveBeenCalledOnce();
  });

  it('does not check when the switch turns them off, or something else still keeps them off', async () => {
    mocks.autoUpdateState.mockResolvedValue({ enabled: false, lock: null });
    await setCliAutoUpdateHandler('c1', message(MessageType.SET_CLI_AUTO_UPDATE, { enabled: false }), connections, bridge);
    mocks.autoUpdateState.mockResolvedValue({ enabled: false, lock: { kind: 'environment' } });
    await setCliAutoUpdateHandler('c1', message(MessageType.SET_CLI_AUTO_UPDATE, { enabled: true }), connections, bridge);
    expect(mocks.triggerNow).not.toHaveBeenCalled();
  });

  it('checks when lifting the nonessential traffic block turns them back on', async () => {
    mocks.autoUpdateState.mockResolvedValue({ enabled: true, lock: null });
    await setNonessentialTrafficHandler('c1', message(MessageType.SET_NONESSENTIAL_TRAFFIC, { disabled: false }), connections, bridge);
    expect(mocks.triggerNow).toHaveBeenCalledOnce();
  });

  it('does not check when the block is turned on', async () => {
    mocks.autoUpdateState.mockResolvedValue({ enabled: false, lock: null });
    await setNonessentialTrafficHandler('c1', message(MessageType.SET_NONESSENTIAL_TRAFFIC, { disabled: true }), connections, bridge);
    expect(mocks.triggerNow).not.toHaveBeenCalled();
  });
});
