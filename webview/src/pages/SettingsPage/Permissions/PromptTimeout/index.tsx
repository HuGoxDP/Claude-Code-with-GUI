import { SettingSection, SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { PROMPT_TIMEOUT_CHOICES } from '@/pages/ChatPage/PromptTimeout';

const OFF_VALUE = 'off';
/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

/**
 * `30 seconds`, `5 minutes`, `1 hour` in the interface language. The browser
 * knows each language's plural forms, so no string per count is needed.
 */
export function formatTimeoutChoice(seconds: number, language: string): string {
  const [value, unit] = seconds % 3600 === 0 ? [seconds / 3600, 'hour'] : seconds % 60 === 0 ? [seconds / 60, 'minute'] : [seconds, 'second'];
  try {
    return new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
  } catch {
    return new Intl.NumberFormat('en', { style: 'unit', unit, unitDisplay: 'long' }).format(value);
  }
}

/**
 * How long a permission request, plan approval or question may wait before it
 * is declined for the user. Ported from CC GUI's dialog timeout; off here by
 * default, so nothing changes for anyone who does not set it.
 */
export function PromptTimeoutSection() {
  const { t, i18n } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();
  const raw = scopeSettings[SettingKey.PROMPT_TIMEOUT_SECONDS] as number | null | undefined;
  const isNotSet = raw === undefined && scope === 'project';
  const current = raw ?? null;

  const options: SelectOption[] = [
    ...(scope === 'project' ? [{ value: NOT_SET_VALUE, label: t('permissions.notSet'), italic: true }] : []),
    { value: OFF_VALUE, label: t('permissions.promptTimeout.off') },
    ...PROMPT_TIMEOUT_CHOICES.map((seconds) => ({ value: String(seconds), label: formatTimeoutChoice(seconds, i18n.language) })),
  ];
  // A value set by hand that is not one of the choices still shows as itself.
  if (current !== null && !PROMPT_TIMEOUT_CHOICES.includes(current as (typeof PROMPT_TIMEOUT_CHOICES)[number])) {
    options.push({ value: String(current), label: formatTimeoutChoice(current, i18n.language) });
  }

  return (
    <SettingSection title={t('permissions.promptTimeout.sectionTitle')}>
      <SettingRow
        label={t('permissions.promptTimeout.label')}
        description={t('permissions.promptTimeout.description')}
        isOverridden={isOverridden(SettingKey.PROMPT_TIMEOUT_SECONDS)}
      >
        <Select
          value={isNotSet ? NOT_SET_VALUE : current === null ? OFF_VALUE : String(current)}
          options={options}
          ariaLabel={t('permissions.promptTimeout.label')}
          onChange={(value) => {
            if (value === NOT_SET_VALUE) {
              resetToGlobal(SettingKey.PROMPT_TIMEOUT_SECONDS);
              return;
            }
            void updateSetting(SettingKey.PROMPT_TIMEOUT_SECONDS, value === OFF_VALUE ? null : Number(value));
          }}
          className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${isNotSet ? 'text-text-tertiary' : 'text-text-primary'}`}
        />
      </SettingRow>
    </SettingSection>
  );
}
