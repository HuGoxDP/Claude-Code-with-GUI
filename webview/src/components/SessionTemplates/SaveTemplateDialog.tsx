import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { Portal } from '../Portal';
import { templateLabels, type SessionTemplate } from './sessionTemplate';
import { useEscapeToClose } from './useEscapeToClose';

/** The longest name the backend keeps (SESSION_TEMPLATE_NAME_MAX). */
const NAME_MAX = 80;

interface Props {
  /** What the template will keep: the chat's choices now. */
  choices: Pick<SessionTemplate, 'model' | 'inputMode' | 'effort'>;
  /** Names already taken, so saving under one says it replaces it. */
  existingNames: readonly string[];
  saving: boolean;
  /** Set when the last save was refused. */
  failed: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/**
 * "Save as template": names the chat's model, mode and effort so a new chat can
 * start with them later (ported from CC GUI's Save as Template). A name that is
 * taken replaces that template, and the button says so before anything is
 * written, as CC GUI asks before it overwrites.
 */
export function SaveTemplateDialog({ choices, existingNames, saving, failed, onSave, onCancel }: Props) {
  const { t } = useTranslation('chat');
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEscapeToClose(onCancel);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const replaces = trimmed !== '' && existingNames.includes(trimmed);
  const labels = templateLabels(choices);
  const rows: [string, string | null][] = [
    [t('sessionTemplates.model'), labels.model],
    [t('sessionTemplates.mode'), labels.inputMode],
    [t('sessionTemplates.effort'), labels.effort],
  ];

  const submit = () => {
    if (trimmed && !saving) onSave(trimmed);
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          role="dialog"
          aria-label={t('sessionTemplates.saveTitle')}
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-3"
        >
          <div>
            <h2 className="text-md font-semibold text-text-primary">{t('sessionTemplates.saveTitle')}</h2>
            <p className="mt-1 text-xs text-text-tertiary">{t('sessionTemplates.saveHint')}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-text-tertiary">{label}</dt>
                <dd className="text-text-primary">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">{t('sessionTemplates.name')}</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              maxLength={NAME_MAX}
              placeholder={t('sessionTemplates.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </label>
          {replaces && <p className="text-xs text-text-secondary">{t('sessionTemplates.replaces', { name: trimmed })}</p>}
          {failed && <p className="text-xs text-state-error-fg">{t('sessionTemplates.saveFailed')}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
            >
              {t('sessionTemplates.cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!trimmed || saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {replaces ? t('sessionTemplates.replace') : t('sessionTemplates.save')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
