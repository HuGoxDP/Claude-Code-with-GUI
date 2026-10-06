import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether `/clear`, Cmd/Ctrl+Shift+C and "Clear conversation" ask before
 * leaving a conversation that has started (ported from CC GUI's new session
 * confirmation). Off by default, as the CLI's own `/clear` never asks. The
 * question itself is in commandPalette/sections/startNewConversation.ts.
 */
export function ConfirmNewSessionRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('general.composer.confirmNewSession.label')}
      description={t('general.composer.confirmNewSession.description')}
      isOverridden={isOverridden(SettingKey.CONFIRM_NEW_SESSION)}
    >
      <ToggleSwitch
        checked={scopeSettings[SettingKey.CONFIRM_NEW_SESSION] === true}
        onChange={(checked) => updateSetting(SettingKey.CONFIRM_NEW_SESSION, checked)}
        ariaLabel={t('general.composer.confirmNewSession.label')}
      />
    </SettingRow>
  );
}
