import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether a new session is named by Claude after its first reply, instead of
 * being listed under its whole first prompt. On by default.
 *
 * The backend reads this when the first reply ends (session-title.ts); a
 * session that already has a name is never renamed.
 */
export function AiSessionTitlesRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();

  const aiSessionTitles = (scopeSettings.aiSessionTitles as boolean | undefined) ?? true;

  return (
    <SettingRow
      label={t('general.aiSessionTitles.label')}
      description={t('general.aiSessionTitles.description')}
      isOverridden={isOverridden(SettingKey.AI_SESSION_TITLES)}
    >
      <ToggleSwitch
        checked={aiSessionTitles}
        onChange={(checked) => updateSetting(SettingKey.AI_SESSION_TITLES, checked)}
        ariaLabel={t('general.aiSessionTitles.label')}
      />
    </SettingRow>
  );
}
