/**
 * `/clear`, Cmd/Ctrl+Shift+C and "Clear conversation" leave the current chat
 * through one function, so whether they ask is one rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import { setCurrentSettings } from '@/utils/openSettingsAt';
import type { CommandPaletteServices } from '../../types';
import { startNewConversation } from '../startNewConversation';
import { ClearCommand } from '../slashCommands/ClearCommand';

function servicesWith({ sessionId = 's1' as string | null, messages = 2, isStreaming = false, answer = true } = {}) {
  const services = {
    chatStream: {
      messages: Array.from({ length: messages }, (_, i) => ({ uuid: String(i) })),
      isStreaming,
      stop: vi.fn(),
      resetForSessionSwitch: vi.fn(),
    },
    session: { currentSessionId: sessionId, resetToNewSession: vi.fn() },
    ui: { confirm: vi.fn().mockResolvedValue(answer) },
  };
  return services as unknown as CommandPaletteServices & typeof services;
}

function askFirst(on: boolean) {
  setCurrentSettings({ ...DEFAULT_SETTINGS, [SettingKey.CONFIRM_NEW_SESSION]: on });
}

beforeEach(() => askFirst(false));

describe('startNewConversation', () => {
  it('starts at once by default, as the CLI\'s /clear does', async () => {
    const services = servicesWith();
    expect(await startNewConversation(services)).toBe(true);
    expect(services.ui.confirm).not.toHaveBeenCalled();
    expect(services.session.resetToNewSession).toHaveBeenCalledTimes(1);
  });

  it('asks first when the setting is on and the conversation has started', async () => {
    askFirst(true);
    const services = servicesWith();
    await startNewConversation(services);
    expect(services.ui.confirm).toHaveBeenCalledTimes(1);
    expect(services.ui.confirm.mock.calls[0][0].message).toBe('This conversation stays in your session list.');
    expect(services.session.resetToNewSession).toHaveBeenCalledTimes(1);
  });

  it('leaves everything as it was when the answer is no, a running reply included', async () => {
    askFirst(true);
    const services = servicesWith({ isStreaming: true, answer: false });
    expect(await startNewConversation(services)).toBe(false);
    expect(services.chatStream.stop).not.toHaveBeenCalled();
    expect(services.chatStream.resetForSessionSwitch).not.toHaveBeenCalled();
    expect(services.session.resetToNewSession).not.toHaveBeenCalled();
  });

  it('says that a running reply will stop', async () => {
    askFirst(true);
    const services = servicesWith({ isStreaming: true });
    await startNewConversation(services);
    expect(services.ui.confirm.mock.calls[0][0].message).toMatch(/still replying/);
    expect(services.chatStream.stop).toHaveBeenCalledTimes(1);
  });

  it('never asks about an empty new chat, which has nothing to lose', async () => {
    askFirst(true);
    const services = servicesWith({ sessionId: null, messages: 0 });
    await startNewConversation(services);
    expect(services.ui.confirm).not.toHaveBeenCalled();
    expect(services.session.resetToNewSession).toHaveBeenCalledTimes(1);
  });

  it('is what /clear runs', async () => {
    askFirst(true);
    const services = servicesWith({ answer: false });
    const command = new ClearCommand();
    (command as unknown as { getServices: () => unknown }).getServices = () => services;
    await command.execute();
    expect(services.ui.confirm).toHaveBeenCalledTimes(1);
    expect(services.session.resetToNewSession).not.toHaveBeenCalled();
  });
});

describe('Start a chat with instructions...', () => {
  async function run(services: CommandPaletteServices) {
    const { getContextItems } = await import('../context/items');
    const { OPEN_INSTRUCTIONS_PICKER_EVENT } = await import('@/components/InstructionsPicker');
    const item = getContextItems().find((candidate) => candidate.id === 'chat-instructions')!;
    item._bind(() => services);
    const opened = vi.fn();
    window.addEventListener(OPEN_INSTRUCTIONS_PICKER_EVENT, opened);
    await item.execute();
    window.removeEventListener(OPEN_INSTRUCTIONS_PICKER_EVENT, opened);
    return opened;
  }

  it('opens the picker right away in an empty chat', async () => {
    const services = servicesWith({ sessionId: null, messages: 0 });
    expect(await run(services)).toHaveBeenCalledTimes(1);
    // Already the conversation the choice is for: nothing to leave.
    expect(services.session.resetToNewSession).not.toHaveBeenCalled();
  });

  it('leaves a started chat first, by the same rule as /clear', async () => {
    const services = servicesWith();
    expect(await run(services)).toHaveBeenCalledTimes(1);
    expect(services.session.resetToNewSession).toHaveBeenCalledTimes(1);
  });

  it('stays put, picker closed, when leaving is declined', async () => {
    askFirst(true);
    const services = servicesWith({ answer: false });
    expect(await run(services)).not.toHaveBeenCalled();
    expect(services.session.resetToNewSession).not.toHaveBeenCalled();
  });
});
