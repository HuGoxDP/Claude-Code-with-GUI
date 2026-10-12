import { useState } from 'react';
import { useTranslation } from '@/i18n';
import type { CustomModelInput, CustomModelView } from '@/hooks/queries/useCustomModels';

interface Props {
  /** The model being changed, or none for a new one. */
  model?: CustomModelView;
  onSave: (input: CustomModelInput) => Promise<string | null>;
  onCancel: () => void;
}

const INPUT =
  'w-full min-w-0 bg-surface-overlay border border-border-default rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder-text-tertiary';

const PRICES = ['inputPrice', 'outputPrice', 'cacheWritePrice', 'cacheReadPrice'] as const;

const asText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Add or change a custom model. Its fields make one model, so it is saved as a whole. */
export function CustomModelForm({ model, onSave, onCancel }: Props) {
  const { t } = useTranslation('settings');
  const [fields, setFields] = useState({
    model: model?.model ?? '',
    label: model?.label ?? '',
    description: model?.description ?? '',
    inputPrice: asText(model?.inputPrice),
    outputPrice: asText(model?.outputPrice),
    cacheWritePrice: asText(model?.cacheWritePrice),
    cacheReadPrice: asText(model?.cacheReadPrice),
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (name: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [name]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const refused = await onSave({ ...(model ? { id: model.id } : {}), ...fields });
    setSaving(false);
    if (refused) setError(refused);
  };

  const label = (text: string, hint?: string) => (
    <span className="mb-1 block text-xs text-text-secondary">
      {text}
      {hint && <span className="ms-1.5 text-text-tertiary">{hint}</span>}
    </span>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface-base p-4">
      <label className="block">
        {label(t('cli.customModels.form.model'), t('cli.customModels.form.modelHint'))}
        <input value={fields.model} onChange={set('model')} spellCheck={false} className={`${INPUT} font-mono`} aria-label={t('cli.customModels.form.model')} />
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          {label(t('cli.customModels.form.label'), t('cli.customModels.form.optional'))}
          <input value={fields.label} onChange={set('label')} className={INPUT} aria-label={t('cli.customModels.form.label')} />
        </label>
        <label className="block">
          {label(t('cli.customModels.form.description'), t('cli.customModels.form.optional'))}
          <input value={fields.description} onChange={set('description')} className={INPUT} aria-label={t('cli.customModels.form.description')} />
        </label>
      </div>
      <div>
        {label(t('cli.customModels.form.prices'))}
        <p className="mb-2 text-xs text-text-tertiary">{t('cli.customModels.form.pricesHint')}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRICES.map((name) => (
            <label key={name} className="block">
              {label(t(`cli.customModels.form.${name}`))}
              <input
                value={fields[name]}
                onChange={set(name)}
                inputMode="decimal"
                placeholder="—"
                className={`${INPUT} tabular-nums`}
                aria-label={t(`cli.customModels.form.${name}`)}
              />
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-state-warning-fg">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border-default px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover">
          {t('cli.customModels.form.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || fields.model.trim() === ''}
          className="rounded-lg bg-accent-primary px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {t('cli.customModels.form.save')}
        </button>
      </div>
    </div>
  );
}
