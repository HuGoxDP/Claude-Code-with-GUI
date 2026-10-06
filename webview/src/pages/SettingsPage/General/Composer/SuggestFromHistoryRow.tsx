import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether the composer shows an earlier prompt that starts with what is typed,
 * for Tab to take (ported from CC GUI's history completion). On by default, as
 * there. The suggestion itself is in ChatInput/historySuggestion.ts.
 */
export function SuggestFromHistoryRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('general.composer.suggestFromHistory.label')}
      description={t('general.composer.suggestFromHistory.description')}
      isOverridden={isOverridden(SettingKey.SUGGEST_FROM_HISTORY)}
    >
      <ToggleSwitch
        checked={scopeSettings[SettingKey.SUGGEST_FROM_HISTORY] !== false}
        onChange={(checked) => updateSetting(SettingKey.SUGGEST_FROM_HISTORY, checked)}
        ariaLabel={t('general.composer.suggestFromHistory.label')}
      />
    </SettingRow>
  );
}
