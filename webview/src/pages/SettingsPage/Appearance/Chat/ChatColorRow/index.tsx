import { useEffect, useMemo, useRef, useState } from 'react';
import { SettingRow } from '../../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { isHexColor } from '@/utils/chatColors';
import { CHAT_COLOR_AREAS, ChatColorArea, isLowContrastBackground } from './areas';

export { ChatColorArea } from './areas';

/**
 * One area's color: Theme, a preset, the system picker or a typed code. Stored
 * as `#rrggbb`, or null to follow the theme (ported from CC GUI's color rows).
 *
 * In the project tab an empty code field means "not set here", so the project
 * follows the global choice; Theme still says "the theme's color" and wins over
 * a global one, which is what a project that wants its plain look back needs.
 *
 * The swatches carry inline `style`: their color is a runtime value, which no
 * Tailwind class can name.
 */
export function ChatColorRow({ area }: { area: ChatColorArea }) {
  const { t } = useTranslation('settings');
  const { isDark } = useTheme();
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();
  const spec = CHAT_COLOR_AREAS[area];
  const palette = isDark ? 'dark' : 'light';
  // The palette on screen is the one being edited: for the background that
  // picks which of its two keys this row writes.
  const key = spec.key[palette];

  const raw = scopeSettings[key] as string | null | undefined;
  const isNotSet = raw === undefined && scope === 'project';
  const followsTheme = raw === null || (raw === undefined && scope === 'global');
  const color = isHexColor(raw) ? raw.toLowerCase() : null;

  const choose = (next: string | null) => void updateSetting(key, next);

  // The field holds what is being typed, which is not a color until it is a
  // whole one; it is saved when focus leaves, and the stored value takes over
  // again whenever that changes.
  const [draft, setDraft] = useState(color ?? '');
  useEffect(() => setDraft(color ?? ''), [color]);
  const commitDraft = () => {
    const value = draft.trim();
    if (value === '') {
      if (isNotSet || followsTheme) return;
      if (scope === 'project') void resetToGlobal(key);
      else choose(null);
      return;
    }
    if (!isHexColor(value)) {
      setDraft(color ?? '');
      return;
    }
    if (value.toLowerCase() !== color) choose(value.toLowerCase());
  };

  // The system picker reports every step of a drag; only where it lands is
  // saved, or each step would be a write to the settings file.
  const [previewing, setPreviewing] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = pickerRef.current;
    if (!input) return;
    const commit = () => {
      setPreviewing(null);
      if (isHexColor(input.value)) void updateSetting(key, input.value.toLowerCase());
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [key, updateSetting]);

  const swatch = previewing ?? color;
  const lowContrast = useMemo(
    () => area === ChatColorArea.Background && color !== null && isLowContrastBackground(color, isDark),
    [area, color, isDark],
  );

  return (
    <SettingRow
      label={t(`appearance.chatColors.${area}.label`)}
      description={t(`appearance.chatColors.${area}.description`)}
      isOverridden={isOverridden(key)}
      below={
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {spec.presets[palette].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => choose(preset)}
                aria-pressed={color === preset}
                aria-label={t('appearance.chatColors.use', { color: preset })}
                title={preset}
                className={`w-6 h-6 rounded-md border ${
                  color === preset
                    ? 'border-border-focus ring-2 ring-border-focus/40'
                    : 'border-border-default hover:border-border-strong'
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
          {lowContrast && (
            <p className="text-xs text-state-warning-fg">{t('appearance.chatColors.lowContrast')}</p>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => choose(null)}
          aria-pressed={followsTheme}
          title={t('appearance.chatColors.themeHint')}
          className={`px-2.5 py-1 rounded-md border text-xs ${
            followsTheme
              ? 'border-border-focus text-text-primary bg-surface-hover'
              : 'border-border-default text-text-secondary hover:bg-surface-hover'
          }`}
        >
          {t('appearance.chatColors.theme')}
        </button>
        {/* Stripes while no color is set, so "the theme's" never passes for a
            color that happens to look like it. */}
        <label
          title={t('appearance.chatColors.pick')}
          className={`relative w-7 h-7 rounded-md border border-border-default overflow-hidden cursor-pointer ${
            swatch ? '' : 'bg-[repeating-linear-gradient(45deg,rgb(var(--border-default-rgb))_0_2px,transparent_2px_6px)]'
          }`}
          style={swatch ? { backgroundColor: swatch } : undefined}
        >
          <input
            ref={pickerRef}
            type="color"
            aria-label={t('appearance.chatColors.pick')}
            value={swatch ?? spec.themeColor[palette]}
            onChange={(e) => setPreviewing(e.target.value.toLowerCase())}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          aria-label={t('appearance.chatColors.hex')}
          aria-invalid={draft !== '' && !isHexColor(draft.trim())}
          placeholder={isNotSet ? t('appearance.chatColors.notSet') : '#rrggbb'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className={`w-24 bg-surface-overlay border rounded-lg px-2 py-1 text-sm font-mono text-text-primary ${
            isNotSet ? 'placeholder:italic' : ''
          } ${draft !== '' && !isHexColor(draft.trim()) ? 'border-state-error-border' : 'border-border-default'}`}
        />
      </div>
    </SettingRow>
  );
}
