import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether an edit card in the chat starts with its diff open (ported from CC
 * GUI's "Expand diffs by default"). Off, each card shows `Modified +N −M` and
 * opens on click. On by default, as the chat always showed them.
 */
export function ExpandDiffsRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('appearance.expandDiffs.label')}
      description={t('appearance.expandDiffs.description')}
      isOverridden={isOverridden(SettingKey.EXPAND_DIFFS)}
    >
      <ToggleSwitch
        checked={scopeSettings[SettingKey.EXPAND_DIFFS] !== false}
        onChange={(checked) => updateSetting(SettingKey.EXPAND_DIFFS, checked)}
        ariaLabel={t('appearance.expandDiffs.label')}
      />
    </SettingRow>
  );
}
