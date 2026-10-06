import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether a reply appears as it is written or whole once each message is
 * finished (ported from CC GUI's Streaming switch). Off is the CLI's own
 * output without `--include-partial-messages`, so it takes a fresh CLI and
 * applies from the next message. On by default, as the chat always was.
 */
export function StreamingRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('appearance.streaming.label')}
      description={t('appearance.streaming.description')}
      isOverridden={isOverridden(SettingKey.STREAMING)}
    >
      <ToggleSwitch
        checked={scopeSettings[SettingKey.STREAMING] !== false}
        onChange={(checked) => updateSetting(SettingKey.STREAMING, checked)}
        ariaLabel={t('appearance.streaming.label')}
      />
    </SettingRow>
  );
}
