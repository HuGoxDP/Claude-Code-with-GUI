import { useState } from 'react';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { SettingSection } from '../../common';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';
import { useCustomModels, type CustomModelInput, type CustomModelView } from '@/hooks/queries/useCustomModels';
import { CustomModelForm } from './CustomModelForm';

const ICON_BUTTON = 'rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary';

/**
 * Custom models (ported from CC GUI): model names the user adds to the model
 * picker, as `claude --model <name>` takes any name in the terminal. They are
 * the user's, shared by every project, so both settings tabs show the same list.
 */
export function CustomModelsSection() {
  const { t, i18n } = useTranslation('settings');
  const { models, loaded, save, remove } = useCustomModels();
  // null: no form; 'new': adding; a number: changing that model.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const { confirmDialog, confirm } = useConfirmDialog();

  const usd = (n: number) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n);
  const priceLine = (m: CustomModelView) =>
    (
      [
        ['input', m.inputPrice],
        ['output', m.outputPrice],
        ['cacheWrite', m.cacheWritePrice],
        ['cacheRead', m.cacheReadPrice],
      ] as const
    )
      .filter(([, price]) => price !== null)
      .map(([part, price]) => t(`cli.customModels.price.${part}`, { price: usd(price as number) }))
      .join(' · ');

  const submit = async (input: CustomModelInput) => {
    const refused = await save(input);
    if (!refused) setEditing(null);
    return refused;
  };

  const deleteModel = async (m: CustomModelView) => {
    const yes = await confirm({
      title: t('cli.customModels.delete'),
      message: t('cli.customModels.confirmDelete', { model: m.model }),
      confirmLabel: t('cli.customModels.delete'),
      variant: 'danger',
    });
    if (yes) await remove(m.id);
  };

  return (
    <SettingSection title={t('cli.customModels.title')} description={t('cli.customModels.description')}>
      {confirmDialog}
      <div className="flex flex-col gap-2">
        {models.map((m) =>
          editing === m.id ? (
            <CustomModelForm key={m.id} model={m} onCancel={() => setEditing(null)} onSave={submit} />
          ) : (
            <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-border-default bg-surface-base p-3.5" data-testid="custom-model">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text-primary">{m.label ?? m.model}</div>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-text-secondary">
                  {m.label && <span className="truncate font-mono">{m.model}</span>}
                  {m.description && <span className="truncate">{m.description}</span>}
                  <span className="text-text-tertiary">{priceLine(m) ? t('cli.customModels.pricesLine', { prices: priceLine(m) }) : t('cli.customModels.noPrices')}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => setEditing(m.id)} className={ICON_BUTTON} title={t('cli.customModels.edit')} aria-label={t('cli.customModels.edit')}>
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void deleteModel(m)} className={ICON_BUTTON} title={t('cli.customModels.delete')} aria-label={t('cli.customModels.delete')}>
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {editing === 'new' ? (
          <CustomModelForm onCancel={() => setEditing(null)} onSave={submit} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing('new')}
            disabled={!loaded}
            className="self-start rounded-lg border border-border-default px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50"
          >
            {t('cli.customModels.add')}
          </button>
        )}
      </div>
    </SettingSection>
  );
}
