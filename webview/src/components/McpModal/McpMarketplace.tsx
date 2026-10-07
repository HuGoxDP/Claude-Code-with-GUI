import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { McpCatalogSource, McpRegistryServer } from '@/shared';
import { listsWithoutQuery, useMcpRegistry } from '@/hooks/useMcpRegistry';
import { Select } from '@/components/Select';
import { useTranslation } from '@/i18n';
import { CATALOG_SOURCE_KEY, McpRegistryCard } from './McpRegistryCard';

interface Props {
  onPick: (server: McpRegistryServer) => void;
  onBack: () => void;
}

/** The catalog picked last, kept for this browser only (a way of browsing, not a setting). */
const SOURCE_STORAGE_KEY = 'ccg-mcp-catalog-source';
const SOURCES = [McpCatalogSource.OFFICIAL, McpCatalogSource.GITHUB, McpCatalogSource.BUILT_IN, McpCatalogSource.ALL];

function readStoredSource(): McpCatalogSource {
  try {
    const stored = localStorage.getItem(SOURCE_STORAGE_KEY);
    return SOURCES.find((s) => s === stored) ?? McpCatalogSource.OFFICIAL;
  } catch {
    return McpCatalogSource.OFFICIAL;
  }
}

/** What the empty list says before a search, per source. */
const PROMPT_KEY: Partial<Record<McpCatalogSource, string>> = {
  [McpCatalogSource.OFFICIAL]: 'searchPrompt',
  [McpCatalogSource.GITHUB]: 'searchPromptGithub',
  [McpCatalogSource.ALL]: 'searchPromptAll',
};

export function McpMarketplace(props: Props) {
  const { t } = useTranslation('common');
  const { onPick, onBack } = props;
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<McpCatalogSource>(readStoredSource);

  // Debounce the search box so each keystroke doesn't hit the registry.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  const chooseSource = (next: string) => {
    const picked = SOURCES.find((s) => s === next) ?? McpCatalogSource.OFFICIAL;
    setSource(picked);
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, picked);
    } catch {
      /* the choice still holds until the panel closes */
    }
  };

  const { servers, unavailableSources, loading, error } = useMcpRegistry(query, source);
  const showsResults = query.trim().length > 0 || listsWithoutQuery(source);

  // The registry returns one entry per published version, so the same server
  // (identical reverse-DNS name) shows up multiple times. Collapse to the first
  // occurrence — the result list has no per-version UI, so the duplicates are
  // pure visual noise.
  const uniqueServers = useMemo(() => {
    const seen = new Set<string>();
    return servers.filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
  }, [servers]);

  const sourceOptions = SOURCES.map((s) => ({ value: s, label: t(`mcpModal.marketplace.source.${CATALOG_SOURCE_KEY[s]}`) }));
  const unavailableNames = unavailableSources.map((s) => t(`mcpModal.marketplace.source.${CATALOG_SOURCE_KEY[s]}`)).join(', ');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: back + search box + catalog */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors flex-shrink-0"
          title={t('mcpModal.marketplace.back')}
        >
          <ArrowLeftIcon className="w-5 h-5 rtl:-scale-x-100" />
        </button>
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          <input
            className="w-full text-md bg-surface-hover border border-border-default rounded ps-8 pe-2 py-1.5 text-text-primary focus:outline-none focus:border-accent-primary"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(source === McpCatalogSource.OFFICIAL ? 'mcpModal.marketplace.searchPlaceholder' : 'mcpModal.marketplace.searchAnyPlaceholder')}
            autoFocus
          />
        </div>
        <Select
          value={source}
          options={sourceOptions}
          onChange={chooseSource}
          ariaLabel={t('mcpModal.marketplace.source.label')}
          className="flex-shrink-0 bg-surface-hover border border-border-default rounded px-2.5 py-1.5 text-sm text-text-primary"
        />
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
        {!showsResults && (
          <p className="px-1 py-8 text-center text-sm text-text-tertiary">
            {t(`mcpModal.marketplace.${PROMPT_KEY[source] ?? 'searchPrompt'}`)}
          </p>
        )}
        {showsResults && loading && (
          <p className="px-1 py-8 text-center text-sm text-text-tertiary">{t('mcpModal.marketplace.searching')}</p>
        )}
        {showsResults && !loading && error && (
          <p className="px-1 py-8 text-center text-sm text-state-error-fg">{error}</p>
        )}
        {showsResults && !loading && !error && unavailableSources.length > 0 && (
          <p className="px-1 pb-2 text-xs text-state-warning-fg">
            {t('mcpModal.marketplace.unavailable', { sources: unavailableNames })}
          </p>
        )}
        {showsResults && !loading && !error && uniqueServers.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-text-tertiary">{t('mcpModal.marketplace.noServers')}</p>
        )}
        {showsResults && !loading && !error && uniqueServers.length > 0 && (
          <div className="flex flex-col gap-2">
            {uniqueServers.map((server) => (
              <McpRegistryCard key={server.name} server={server} showSource={source === McpCatalogSource.ALL} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
