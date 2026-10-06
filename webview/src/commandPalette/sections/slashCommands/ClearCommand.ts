import { SlashCommand } from '../../types';
import { i18n } from '@/i18n';
import { startNewConversation } from '../startNewConversation';

export class ClearCommand extends SlashCommand {
  readonly id = 'cmd-clear';
  readonly label = '/clear';

  get description(): string {
    return i18n.t('commandPalette:slashCommands.clearDescription');
  }

  async execute(): Promise<void> {
    await startNewConversation(this.getServices());
  }

  bindKeyboard(e: KeyboardEvent): boolean {
    return (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C';
  }
}
