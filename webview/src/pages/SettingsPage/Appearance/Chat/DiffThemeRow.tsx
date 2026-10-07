import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { DiffTheme, SettingKey } from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * The colours of the diffs in the chat (ported from CC GUI's "Diff Theme"):
 * the chat theme's, the IDE theme's lightness, or a fixed light or soft dark.
 * "IDE" is offered only inside the IDE; a browser has no IDE theme to follow.
 */
export function DiffThemeRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  const stored = scopeSettings[SettingKey.DIFF_THEME] as DiffTheme | undefined;
  // A choice of "IDE" made in the IDE reads as "follow" in a browser, which is
  // what it does there, so the dropdown never shows a value it does not offer.
  const value = stored === DiffTheme.IDE && !isJetBrains() ? DiffTheme.FOLLOW : (stored ?? DiffTheme.FOLLOW);

  const options: SelectOption[] = [
    { value: DiffTheme.FOLLOW, label: t('appearance.diffTheme.follow') },
    ...(isJetBrains() ? [{ value: DiffTheme.IDE, label: t('appearance.diffTheme.ide') }] : []),
    { value: DiffTheme.LIGHT, label: t('appearance.diffTheme.light') },
    { value: DiffTheme.SOFT_DARK, label: t('appearance.diffTheme.softDark') },
  ];

  return (
    <SettingRow
      label={t('appearance.diffTheme.label')}
      description={t('appearance.diffTheme.description')}
      isOverridden={isOverridden(SettingKey.DIFF_THEME)}
    >
      <Select
        value={value}
        options={options}
        ariaLabel={t('appearance.diffTheme.label')}
        onChange={(next) => updateSetting(SettingKey.DIFF_THEME, next as DiffTheme)}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
