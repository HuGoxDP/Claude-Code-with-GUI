import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n';

interface Props {
  title: string;
  /** The lines under the title: the address, the models, the key. */
  details: ReactNode;
  inUse: boolean;
  onUse: () => void;
  /** Edit and Delete, for a provider of the user's; Claude login has none. */
  actions?: ReactNode;
}

/** One way of reaching Claude, with Use (or In use) and its own actions. */
export function ProviderCard({ title, details, inUse, onUse, actions }: Props) {
  const { t } = useTranslation('settings');
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border p-3.5 ${
        inUse ? 'border-accent-primary bg-surface-hover' : 'border-border-default bg-surface-base'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary truncate">{title}</div>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-text-secondary">{details}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {inUse ? (
          <span className="rounded-md border border-accent-primary px-2.5 py-1 text-xs text-accent-primary">{t('cli.providers.inUse')}</span>
        ) : (
          <button
            type="button"
            onClick={onUse}
            className="rounded-md bg-accent-primary px-2.5 py-1 text-xs text-white hover:opacity-90"
          >
            {t('cli.providers.use')}
          </button>
        )}
      </div>
    </div>
  );
}
