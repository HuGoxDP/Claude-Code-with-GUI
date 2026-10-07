import { useTranslation } from '@/i18n';
import { Portal } from '../Portal';
import { templateSummary, type SessionTemplate } from './sessionTemplate';
import { useEscapeToClose } from './useEscapeToClose';

interface Props {
  templates: SessionTemplate[];
  loading: boolean;
  /** Could not read the templates; said instead of an empty list that would look like none. */
  failed: boolean;
  onPick: (template: SessionTemplate) => void;
  onDelete: (template: SessionTemplate) => void;
  onCancel: () => void;
}

/**
 * "New chat from template": lists the saved templates with what each sets, and
 * starts a new chat with the one picked (ported from CC GUI's Create from
 * Template). A template can be deleted here too.
 */
export function TemplatePicker({ templates, loading, failed, onPick, onDelete, onCancel }: Props) {
  const { t } = useTranslation('chat');
  useEscapeToClose(onCancel);

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
          aria-label={t('sessionTemplates.pickerTitle')}
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-3 max-h-[80vh]"
        >
          <div>
            <h2 className="text-md font-semibold text-text-primary">{t('sessionTemplates.pickerTitle')}</h2>
            <p className="mt-1 text-xs text-text-tertiary">{t('sessionTemplates.pickerHint')}</p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto -mx-1" aria-label={t('sessionTemplates.pickerTitle')}>
            {loading && <li className="px-3 py-2 text-sm text-text-tertiary">{t('sessionTemplates.loading')}</li>}
            {failed && <li className="px-3 py-2 text-sm text-state-error-fg">{t('sessionTemplates.loadFailed')}</li>}
            {!loading && !failed && templates.length === 0 && (
              <li className="px-3 py-2 text-sm text-text-tertiary">{t('sessionTemplates.empty')}</li>
            )}
            {templates.map((template) => (
              <li key={template.name} className="group flex items-center gap-1 rounded-lg hover:bg-surface-hover">
                <button
                  type="button"
                  onClick={() => onPick(template)}
                  className="min-w-0 flex-1 text-start px-3 py-2"
                >
                  <div className="text-sm text-text-primary truncate">{template.name}</div>
                  <div className="text-xs text-text-tertiary truncate">{templateSummary(template)}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(template)}
                  aria-label={t('sessionTemplates.delete', { name: template.name })}
                  title={t('sessionTemplates.delete', { name: template.name })}
                  className="shrink-0 me-2 p-1.5 rounded-md text-text-tertiary hover:text-state-error-fg hover:bg-surface-tooltip"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
            >
              {t('sessionTemplates.cancel')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
