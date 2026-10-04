import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../claude', () => ({ Claude: { applyConfigDir: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../../features/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/skills')>();
  return { ...actual, listSkills: vi.fn(), setSkillState: vi.fn() };
});

import { Claude } from '../../claude';
import { listSkills, setSkillState } from '../../features/skills';
import { getSkillsHandler, setSkillStateHandler } from '../skills';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const bridge = {} as Bridge;
const message = (type: MessageType, payload: Record<string, unknown>): IPCMessage => ({ type, payload, timestamp: 0, requestId: 'r' });
const connections = () => ({ sendTo: vi.fn() }) as unknown as ConnectionManager;
const ack = (c: ConnectionManager) => vi.mocked(c.sendTo).mock.calls[0]![2] as Record<string, unknown>;

describe('skills handlers', () => {
  beforeEach(() => {
    vi.mocked(listSkills).mockReset().mockResolvedValue([]);
    vi.mocked(setSkillState).mockReset();
    vi.mocked(Claude.applyConfigDir).mockClear();
  });

  it('lists skills for the project, in its Claude data directory', async () => {
    const c = connections();
    await getSkillsHandler('c', message(MessageType.GET_SKILLS, { workingDir: '/p' }), c, bridge);
    expect(Claude.applyConfigDir).toHaveBeenCalledWith('/p');
    expect(listSkills).toHaveBeenCalledWith('/p');
    expect(ack(c)).toEqual({ requestId: 'r', status: 'ok', skills: [] });
  });

  it('changes a state and answers with the new list', async () => {
    vi.mocked(setSkillState).mockResolvedValue({ status: 'ok', file: '/p/.claude/settings.local.json' });
    const c = connections();
    await setSkillStateHandler('c', message(MessageType.SET_SKILL_STATE, { workingDir: '/p', name: 'deploy', scope: 'project', state: 'off' }), c, bridge);
    expect(setSkillState).toHaveBeenCalledWith('/p', { name: 'deploy', scope: 'project' }, 'off');
    expect(ack(c)).toMatchObject({ status: 'ok', file: '/p/.claude/settings.local.json', skills: [] });
  });

  it('rejects a state the CLI does not know, and a project skill with no project', async () => {
    const c = connections();
    await setSkillStateHandler('c', message(MessageType.SET_SKILL_STATE, { name: 'a', scope: 'user', state: 'disabled' }), c, bridge);
    await setSkillStateHandler('c', message(MessageType.SET_SKILL_STATE, { name: 'a', scope: 'project', state: 'off' }), c, bridge);
    expect(setSkillState).not.toHaveBeenCalled();
    expect(vi.mocked(c.sendTo).mock.calls.map((call) => (call[2] as { status: string }).status)).toEqual(['error', 'error']);
  });

  it('passes a refused write through', async () => {
    vi.mocked(setSkillState).mockResolvedValue({ status: 'error', error: 'refusing to overwrite' });
    const c = connections();
    await setSkillStateHandler('c', message(MessageType.SET_SKILL_STATE, { name: 'a', scope: 'user', state: 'off' }), c, bridge);
    expect(ack(c)).toEqual({ requestId: 'r', status: 'error', error: 'refusing to overwrite' });
  });
});
