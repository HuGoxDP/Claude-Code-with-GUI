import { SettingSection } from '../../common';
import { HideToolCallsRow } from './HideToolCallsRow';
import { StreamingRow } from './StreamingRow';
import { ChatColorArea, ChatColorRow } from './ChatColorRow';
import { useTranslation } from '@/i18n';

/** How much of a turn the chat shows and when, and the colors of its three areas. */
export function ChatSection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('appearance.chat.sectionTitle')}>
      <HideToolCallsRow />
      <StreamingRow />
      <ChatColorRow area={ChatColorArea.Background} />
      <ChatColorRow area={ChatColorArea.Header} />
      <ChatColorRow area={ChatColorArea.UserMessage} />
    </SettingSection>
  );
}
