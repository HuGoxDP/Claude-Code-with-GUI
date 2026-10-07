import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { McpCatalogSource, McpRegistryServer } from '@/shared';
import { useTranslation } from '@/i18n';

/** The source names under `mcpModal.marketplace.source`. */
export const CATALOG_SOURCE_KEY: Record<McpCatalogSource, string> = {
  [McpCatalogSource.OFFICIAL]: 'official',
  [McpCatalogSource.GITHUB]: 'github',
  [McpCatalogSource.BUILT_IN]: 'builtIn',
  [McpCatalogSource.ALL]: 'all',
};

interface Props {
  server: McpRegistryServer;
  /** Name the catalog the server came from, for a list from all of them. */
  showSource?: boolean;
  onPick: (s: McpRegistryServer) => void;
}

/** One server in the marketplace: its name (linking to its repository), what it does, and Add. */
export function McpRegistryCard({ server, showSource = false, onPick }: Props) {
  const { t } = useTranslation('common');
  const shortName = server.name.split('/').pop() || server.name;
  const installable = server.config !== null;

  return (
    <div className="flex items-start justify-between gap-3 p-3.5 bg-surface-base border border-border-default rounded-lg">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {server.repositoryUrl ? (
            <a
              href={server.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group/title inline-flex items-center gap-1 min-w-0 text-sm font-semibold text-text-primary hover:text-accent-primary transition-colors"
              title={t('mcpModal.marketplace.openRepo', { url: server.repositoryUrl })}
            >
              <span className="truncate underline-offset-2 group-hover/title:underline">{shortName}</span>
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary group-hover/title:text-accent-primary" />
            </a>
          ) : (
            <span className="text-sm font-semibold text-text-primary truncate">{shortName}</span>
          )}
          <span className="text-xs text-text-tertiary font-mono truncate">{server.name}</span>
          {showSource && server.source && (
            <span className="flex-shrink-0 rounded border border-border-default px-1.5 text-[0.6875rem] text-text-tertiary">
              {t(`mcpModal.marketplace.source.${CATALOG_SOURCE_KEY[server.source]}`)}
            </span>
          )}
        </div>
        {server.description && (
          <p className="mt-1 text-xs text-text-secondary line-clamp-2">{server.description}</p>
        )}
        {server.requiredInputs.length > 0 && (
          <p className="mt-1 text-xs text-text-tertiary">
            {t('mcpModal.marketplace.needsInputs', {
              count: server.requiredInputs.length,
              inputs: server.requiredInputs.join(', '),
            })}
          </p>
        )}
      </div>
      <button
        disabled={!installable}
        onClick={() => onPick(server)}
        className="flex-shrink-0 text-md px-3 py-1.5 rounded bg-accent-primary text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        title={installable ? t('mcpModal.marketplace.configureAdd') : t('mcpModal.marketplace.noInstallInfo')}
      >
        {t('mcpModal.marketplace.add')}
      </button>
    </div>
  );
}
