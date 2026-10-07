import { useQuery } from '@tanstack/react-query';
import { useBridge } from './useBridge';
import { MessageType, McpCatalogSource, McpRegistryServer } from '@/shared';

export interface UseMcpRegistryReturn {
  servers: McpRegistryServer[];
  nextCursor: string | null;
  /** With all sources: the ones that could not be reached. */
  unavailableSources: McpCatalogSource[];
  loading: boolean;
  error: string | null;
}

/**
 * Whether [source] lists its servers before anything is typed. Only the
 * built-in list does: it is short, and the registries hold thousands.
 */
export function listsWithoutQuery(source: McpCatalogSource): boolean {
  return source === McpCatalogSource.BUILT_IN;
}

/**
 * Search an MCP catalog (the official registry unless [source] says otherwise).
 * Disabled until `query` is non-empty, except for a source that lists without
 * one, so an empty search box does not fire a request. Cached per source and query.
 */
export function useMcpRegistry(query: string, source: McpCatalogSource = McpCatalogSource.OFFICIAL): UseMcpRegistryReturn {
  const { send } = useBridge();
  const trimmed = query.trim();

  const { data, isFetching, error: queryError } = useQuery({
    queryKey: ['mcp-registry', source, trimmed],
    queryFn: async () => {
      const res = await send<{
        status: string;
        servers?: McpRegistryServer[];
        nextCursor?: string | null;
        unavailableSources?: McpCatalogSource[];
        error?: string;
      }>(MessageType.SEARCH_MCP_REGISTRY, { query: trimmed, source });
      if (res.status === 'ok') {
        return { servers: res.servers ?? [], nextCursor: res.nextCursor ?? null, unavailableSources: res.unavailableSources ?? [] };
      }
      throw new Error(res.error ?? 'Failed to search the MCP registry');
    },
    enabled: trimmed.length > 0 || listsWithoutQuery(source),
    staleTime: 60 * 1000,
    retry: false,
  });

  const error =
    queryError instanceof Error ? queryError.message : queryError != null ? String(queryError) : null;

  return {
    servers: data?.servers ?? [],
    nextCursor: data?.nextCursor ?? null,
    unavailableSources: data?.unavailableSources ?? [],
    loading: isFetching,
    error,
  };
}

/**
 * Convert a registry entry into pre-filled values for the Add form.
 * The reverse-DNS name (e.g. "io.github.acme/widget") is shortened to its last
 * path segment as a sensible default the user can edit; the config is stringified
 * as the JSON the smart parser will read back.
 */
export function registryServerToPrefill(server: McpRegistryServer): { name: string; json: string } {
  const name = server.name.split('/').pop() || server.name;
  const json = server.config ? JSON.stringify(server.config, null, 2) : '';
  return { name, json };
}
