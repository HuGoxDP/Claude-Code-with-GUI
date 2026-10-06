import { i18n } from '@/i18n';
import { DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import { getCurrentSettings } from '@/utils/openSettingsAt';
import type { CommandPaletteServices } from '../types';

/**
 * Leave the current conversation for a new one in this tab: `/clear`,
 * Cmd/Ctrl+Shift+C and "Clear conversation" all come here, so they ask (or do
 * not) by one rule.
 *
 * With "Ask before a new conversation" on, a conversation that has started is
 * not left without a yes: the CLI's `/clear` never asks, so the question is off
 * by default (ported from CC GUI's new session confirmation, which is on there).
 * A reply still being written is stopped by leaving, so the question says so.
 * An empty new chat has nothing to lose and is never asked about.
 *
 * Returns whether the new conversation was started.
 */
export async function startNewConversation(services: CommandPaletteServices): Promise<boolean> {
  const { chatStream, session, ui } = services;
  const ask = (getCurrentSettings() ?? DEFAULT_SETTINGS)[SettingKey.CONFIRM_NEW_SESSION] === true;
  const hasStarted = session.currentSessionId !== null || chatStream.messages.length > 0;

  if (ask && hasStarted) {
    const t = (key: string) => i18n.t(`commandPalette:newConversation.${key}`);
    const confirmed = await ui.confirm({
      title: t('title'),
      message: chatStream.isStreaming ? t('messageWhileReplying') : t('message'),
      confirmLabel: t('confirm'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) return false;
  }

  if (chatStream.isStreaming) chatStream.stop();
  chatStream.resetForSessionSwitch();
  session.resetToNewSession();
  return true;
}
