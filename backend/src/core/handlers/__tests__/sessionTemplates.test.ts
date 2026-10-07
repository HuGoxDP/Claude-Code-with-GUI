import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/session-templates-store', () => ({
  readSessionTemplates: vi.fn(),
  saveSessionTemplate: vi.fn(),
  deleteSessionTemplate: vi.fn(),
}));

import { deleteSessionTemplateHandler, getSessionTemplatesHandler, saveSessionTemplateHandler } from '../sessionTemplates';
import { deleteSessionTemplate, readSessionTemplates, saveSessionTemplate } from '../../features/session-templates-store';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

const connections = () => ({ sendTo: vi.fn() }) as unknown as ConnectionManager;
const message = (type: MessageType, payload: Record<string, unknown>): IPCMessage => ({ type, payload, timestamp: 0, requestId: 'r1' });
const template = { name: 'review', model: 'opus', inputMode: 'plan', effort: 'high', updatedAt: 1 };

describe('session template handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers GET with the stored templates', async () => {
    vi.mocked(readSessionTemplates).mockResolvedValue([template] as never);
    const c = connections();
    await getSessionTemplatesHandler('c1', message(MessageType.GET_SESSION_TEMPLATES, {}), c, {} as Bridge);
    expect(c.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'ok', templates: [template] });
  });

  it('passes SAVE on and reports a refusal with its reason', async () => {
    vi.mocked(saveSessionTemplate).mockResolvedValue({ ok: false, error: 'name is required', templates: [] });
    const c = connections();
    await saveSessionTemplateHandler('c1', message(MessageType.SAVE_SESSION_TEMPLATE, { name: '' }), c, {} as Bridge);
    expect(saveSessionTemplate).toHaveBeenCalledWith({ name: '' });
    expect(c.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'error', error: 'name is required', templates: [] });
  });

  it('deletes by the name given and replies with the list', async () => {
    vi.mocked(deleteSessionTemplate).mockResolvedValue({ ok: true, templates: [] });
    const c = connections();
    await deleteSessionTemplateHandler('c1', message(MessageType.DELETE_SESSION_TEMPLATE, { name: 'review' }), c, {} as Bridge);
    expect(deleteSessionTemplate).toHaveBeenCalledWith('review');
    expect(c.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'ok', templates: [] });
  });
});
