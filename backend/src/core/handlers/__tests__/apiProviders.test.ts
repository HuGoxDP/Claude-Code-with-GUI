import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/api-providers', () => ({
  readApiProviders: vi.fn(),
  saveApiProvider: vi.fn(),
  deleteApiProvider: vi.fn(),
  applyApiProvider: vi.fn(),
}));
vi.mock('../../features/claude-settings', () => ({
  readMergedClaudeSettings: vi.fn(async () => ({ settings: { env: {} }, overrides: [] })),
}));

import { applyApiProviderHandler, getApiProvidersHandler, saveApiProviderHandler } from '../apiProviders';
import { applyApiProvider, readApiProviders, saveApiProvider } from '../../features/api-providers';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

const connections = () => ({ sendTo: vi.fn(), broadcastToAll: vi.fn() }) as unknown as ConnectionManager;
const message = (type: MessageType, payload: Record<string, unknown>): IPCMessage => ({ type, payload, timestamp: 0, requestId: 'r1' });
const list = { ok: true, providers: [], inUse: { kind: 'login' as const } };

describe('API provider handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers GET with the list and the provider in use', async () => {
    vi.mocked(readApiProviders).mockResolvedValue(list);
    const c = connections();
    await getApiProvidersHandler('c1', message(MessageType.GET_API_PROVIDERS, {}), c, {} as Bridge);
    expect(c.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'ok', ...list });
    expect(c.broadcastToAll).not.toHaveBeenCalled();
  });

  it('tells every tab the settings changed after using a provider', async () => {
    vi.mocked(applyApiProvider).mockResolvedValue({ ...list, inUse: { kind: 'provider', id: 3 } });
    const c = connections();
    await applyApiProviderHandler('c1', message(MessageType.APPLY_API_PROVIDER, { id: 3 }), c, {} as Bridge);
    expect(applyApiProvider).toHaveBeenCalledWith(3);
    expect(c.broadcastToAll).toHaveBeenCalledWith(MessageType.CLAUDE_SETTINGS_CHANGED, { settings: { env: {} }, overrides: [] });
  });

  it('reads anything but a number as Claude login', async () => {
    vi.mocked(applyApiProvider).mockResolvedValue(list);
    await applyApiProviderHandler('c1', message(MessageType.APPLY_API_PROVIDER, { id: 'x' }), connections(), {} as Bridge);
    expect(applyApiProvider).toHaveBeenCalledWith(null);
  });

  it('answers a refusal as an error, with its reason, and announces nothing', async () => {
    vi.mocked(saveApiProvider).mockResolvedValue({ ...list, ok: false, error: 'A name is required, of at most 80 characters' });
    const c = connections();
    await saveApiProviderHandler('c1', message(MessageType.SAVE_API_PROVIDER, { name: '' }), c, {} as Bridge);
    expect(c.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'error', error: 'A name is required, of at most 80 characters' }));
    expect(c.broadcastToAll).not.toHaveBeenCalled();
  });
});
