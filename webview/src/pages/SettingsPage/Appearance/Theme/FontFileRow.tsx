import { useEffect, useState } from 'react';
import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { useBridge } from '@/hooks/useBridge';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { checkFontFilePath, FONT_FILE_SETTING, fontFileNote, FontFileKind, useFontFileStatus, type FontFileErrorCode } from '@/utils/fontFiles';

/**
 * A font file of the user's own for the text or for code (ported from CC GUI's
 * custom UI and code font files): a path typed or chosen, saved when focus
 * leaves, empty for the built-in font. Below it, whether the file is in use.
 */
export function FontFileRow({ kind }: { kind: FontFileKind }) {
  const { t } = useTranslation('settings');
  const { send } = useBridge();
  const isOverridden = useIsOverriddenByProject();
  const { settings, scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();
  const key = FONT_FILE_SETTING[kind];
  const status = useFontFileStatus(kind);

  const raw = scopeSettings[key] as string | null | undefined;
  const isNotSet = raw === undefined && scope === 'project';
  const stored = raw ?? '';
  const [draft, setDraft] = useState(stored);
  // A typo is answered here rather than saved and refused.
  const [problem, setProblem] = useState<FontFileErrorCode | null>(null);
  useEffect(() => {
    setDraft(stored);
    setProblem(null);
  }, [stored]);

  const save = (value: string) => {
    const next = value.trim();
    if (next === stored) return setProblem(null);
    if (next === '') {
      setProblem(null);
      if (scope === 'project') void resetToGlobal(key);
      else void updateSetting(key, null);
      return;
    }
    const check = checkFontFilePath(next);
    setProblem(check);
    if (!check) void updateSetting(key, next);
  };

  const choose = async () => {
    const res = await send(MessageType.PICK_FILES, { mode: 'files', multiple: false });
    const picked = (res?.paths as string[] | undefined)?.[0];
    if (picked) {
      setDraft(picked);
      save(picked);
    }
  };

  const found = fontFileNote(problem, stored, settings[key], status);
  const note = found && { text: t(`appearance.fontFile.${found.key}`, found.params), warn: found.warn };

  const label = t(`appearance.theme.${kind}Font.label`);
  return (
    <SettingRow label={label} description={t(`appearance.theme.${kind}Font.description`)} isOverridden={isOverridden(key)}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            spellCheck={false}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => save(draft)}
            placeholder={isNotSet ? t('appearance.theme.fontSize.notSetPlaceholder') : t('appearance.fontFile.builtIn')}
            className="w-56 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
          />
          <button
            type="button"
            onClick={() => void choose()}
            className="shrink-0 rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
          >
            {t('appearance.fontFile.choose')}
          </button>
        </div>
        {note && (
          <span className={`text-xs truncate max-w-72 pr-0.5 ${note.warn ? 'text-state-warning-fg' : 'text-text-tertiary'}`} title={note.text}>
            {note.text}
          </span>
        )}
      </div>
    </SettingRow>
  );
}
