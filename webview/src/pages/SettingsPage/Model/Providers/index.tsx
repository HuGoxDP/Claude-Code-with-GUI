import { useState } from 'react';
import toast from 'react-hot-toast';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { SettingSection } from '../../common';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { ProviderCard } from './ProviderCard';
import { ProviderForm } from './ProviderForm';
import { useApiProviders, type ApiProviderView } from './useApiProviders';

const ICON_BUTTON = 'rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary';

/** The model slots a provider fills, in the words the card uses. */
function modelLine(p: ApiProviderView): string {
  return [
    p.model,
    p.opusModel && `Opus → ${p.opusModel}`,
    p.sonnetModel && `Sonnet → ${p.sonnetModel}`,
    p.haikuModel && `Haiku → ${p.haikuModel}`,
    p.fableModel && `Fable → ${p.fableModel}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * API providers (ported from CC GUI's provider manager): ways of reaching Claude
 * through another endpoint, each a set of documented ANTHROPIC_* variables that
 * Use writes into the user settings.json, and Claude login removes. Only the user
 * settings carry them, so the project tab shows the section inert.
 */
export function ProvidersSection() {
  const { t } = useTranslation('settings');
  const { scope } = useClaudeSettings();
  const { providers, inUse, loaded, save, remove, use } = useApiProviders();
  // null: no form; 'new': adding; a number: changing that provider.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const { confirmDialog, confirm } = useConfirmDialog();

  const deleteProvider = async (p: ApiProviderView) => {
    const yes = await confirm({
      title: t('cli.providers.delete'),
      message: t('cli.providers.confirmDelete', { name: p.name }),
      confirmLabel: t('cli.providers.delete'),
      variant: 'danger',
    });
    if (yes) await remove(p.id);
  };

  const useProvider = async (id: number | null, name: string) => {
    const refused = await use(id);
    if (refused) toast.error(refused);
    else toast.success(t('cli.providers.switched', { name }));
  };

  const content = (
    <div className="flex flex-col gap-2">
      {inUse.kind === 'other' && <p className="text-xs text-state-warning-fg">{t('cli.providers.other')}</p>}
      <ProviderCard
        title={t('cli.providers.login')}
        details={<span>{t('cli.providers.loginDetails')}</span>}
        inUse={inUse.kind === 'login'}
        onUse={() => void useProvider(null, t('cli.providers.login'))}
      />
      {providers.map((p) =>
        editing === p.id ? (
          <ProviderForm
            key={p.id}
            provider={p}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              const refused = await save(input);
              if (!refused) setEditing(null);
              return refused;
            }}
          />
        ) : (
          <ProviderCard
            key={p.id}
            title={p.name}
            inUse={inUse.kind === 'provider' && inUse.id === p.id}
            onUse={() => void useProvider(p.id, p.name)}
            details={
              <>
                <span className="font-mono truncate">{p.baseUrl ?? t('cli.providers.defaultAddress')}</span>
                {modelLine(p) && <span className="font-mono truncate">{modelLine(p)}</span>}
                <span>{p.hasKey ? t('cli.providers.keyIn', { variable: p.authVar }) : t('cli.providers.noKey')}</span>
              </>
            }
            actions={
              <>
                <button type="button" onClick={() => setEditing(p.id)} className={ICON_BUTTON} title={t('cli.providers.edit')} aria-label={t('cli.providers.edit')}>
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteProvider(p)}
                  className={ICON_BUTTON}
                  title={t('cli.providers.delete')}
                  aria-label={t('cli.providers.delete')}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </>
            }
          />
        ),
      )}
      {editing === 'new' ? (
        <ProviderForm
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            const refused = await save(input);
            if (!refused) setEditing(null);
            return refused;
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          disabled={!loaded}
          className="self-start rounded-lg border border-border-default px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50"
        >
          {t('cli.providers.add')}
        </button>
      )}
    </div>
  );

  return (
    <SettingSection title={t('cli.providers.title')} description={t('cli.providers.description')}>
      {confirmDialog}
      {scope === 'project' ? (
        <>
          <p className="mb-3 text-xs text-text-tertiary">{t('cli.providers.userOnly')}</p>
          <div className="pointer-events-none opacity-40">{content}</div>
        </>
      ) : (
        content
      )}
    </SettingSection>
  );
}
