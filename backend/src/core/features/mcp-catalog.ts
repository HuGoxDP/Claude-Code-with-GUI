/**
 * The MCP marketplace's sources (ported from CC GUI's marketplace sources): the
 * official MCP Registry, GitHub's MCP Registry, a few built-in servers, or all
 * of them at once.
 *
 * Both registries implement the same public Generic MCP Registry API, so their
 * entries go through the one normaliser in mcp-registry.ts. They differ in who
 * searches: the official registry takes a `search` parameter, while GitHub's is
 * read a few pages at a time (only `limit` and `cursor`, the parameters every
 * implementation of the API has) and searched here, from a copy kept for an
 * hour. Nothing here talks to Claude; installing still goes through
 * `claude mcp add-json`.
 *
 * CC GUI also lists the repositories of the `modelcontextprotocol` GitHub
 * organisation. That source is not carried over: those repositories are mostly
 * SDKs, the specification and tools rather than servers, and none comes with a
 * way to run it, so each would be an entry that cannot be added.
 */

import { McpCatalogSource, McpTransportType } from '../../shared';
import type { McpRegistryServer, McpRegistrySearchResult } from '../../shared';
import { normalizeRegistryServer, searchMcpRegistry } from './mcp-registry';
import { proxiedRequest } from './outbound-proxy';

const GITHUB_REGISTRY = 'https://api.mcp.github.com/v0.1/servers';
const GITHUB_PAGE_LIMIT = 100;
/** Pages read from GitHub's registry; 500 servers is more than a search list needs. */
const GITHUB_MAX_PAGES = 5;
const GITHUB_CACHE_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Servers listed by the plugin itself: well-known ones from the MCP project and
 * one documentation server, each with the command its own README gives. The
 * fetch and time servers are Python packages, run with `uvx` (from uv).
 */
export const BUILT_IN_SERVERS: readonly McpRegistryServer[] = [
  builtIn(
    'modelcontextprotocol/fetch',
    'Fetch web pages and convert them into model-friendly content.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    'uvx',
    ['mcp-server-fetch'],
  ),
  builtIn(
    'modelcontextprotocol/time',
    'Current time and conversions between time zones.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/time',
    'uvx',
    ['mcp-server-time'],
  ),
  builtIn(
    'modelcontextprotocol/memory',
    'A local knowledge graph that persists across chats.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    'npx',
    ['-y', '@modelcontextprotocol/server-memory'],
  ),
  builtIn(
    'modelcontextprotocol/sequential-thinking',
    'A tool for working through a problem in structured, revisable steps.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    'npx',
    ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  ),
  builtIn(
    'upstash/context7',
    'Current documentation and code examples for libraries.',
    'https://github.com/upstash/context7',
    'npx',
    ['-y', '@upstash/context7-mcp'],
  ),
];

function builtIn(name: string, description: string, repositoryUrl: string, command: string, args: string[]): McpRegistryServer {
  return {
    name,
    description,
    version: '',
    repositoryUrl,
    config: { type: McpTransportType.STDIO, command, args },
    requiredInputs: [],
    source: McpCatalogSource.BUILT_IN,
  };
}

/** Whether [server] matches [query] by name or description, ignoring case. An empty query matches all. */
export function matchesQuery(server: McpRegistryServer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return server.name.toLowerCase().includes(q) || server.description.toLowerCase().includes(q);
}

// ─── GitHub's registry ─────────────────────────────────────────────────────────

interface RegistryPage {
  servers?: unknown[];
  metadata?: { nextCursor?: string; next_cursor?: string };
}

/** Fetches one URL and returns its body; injectable for tests. */
export type FetchText = (url: string) => Promise<string>;

const fetchText: FetchText = async (url) => {
  // proxiedRequest, as for the official registry: the global fetch ignores HTTP_PROXY.
  const res = await proxiedRequest(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  if (!res.ok) throw new Error(`GitHub MCP registry returned HTTP ${res.status}`);
  return res.body;
};

let githubCache: { at: number; servers: McpRegistryServer[] } | null = null;

/** Forget GitHub's registry, for tests. */
export function resetGithubRegistryCache(): void {
  githubCache = null;
}

/** GitHub's registry, a few pages of it, kept for an hour. */
export async function loadGithubRegistry(fetch: FetchText = fetchText, now = Date.now()): Promise<McpRegistryServer[]> {
  if (githubCache && now - githubCache.at < GITHUB_CACHE_MS) return githubCache.servers;

  const servers: McpRegistryServer[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < GITHUB_MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(GITHUB_PAGE_LIMIT) });
    if (cursor) params.set('cursor', cursor);
    const data = JSON.parse(await fetch(`${GITHUB_REGISTRY}?${params.toString()}`)) as RegistryPage;
    for (const entry of data.servers ?? []) {
      const server = normalizeRegistryServer(entry);
      if (server) servers.push({ ...server, source: McpCatalogSource.GITHUB });
    }
    cursor = data.metadata?.nextCursor || data.metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  githubCache = { at: now, servers };
  return servers;
}

// ─── Searching ─────────────────────────────────────────────────────────────────

/** What searching needs from outside, injectable for tests. */
export interface CatalogDeps {
  searchOfficial: (query: string, cursor?: string) => Promise<McpRegistrySearchResult>;
  loadGithub: () => Promise<McpRegistryServer[]>;
}

const defaultDeps: CatalogDeps = {
  searchOfficial: searchMcpRegistry,
  loadGithub: () => loadGithubRegistry(),
};

/**
 * Search [source] for [query]. One source fails as a whole (the caller reports
 * the error); ALL answers with the sources that did, and names the others in
 * `unavailableSources`, failing only when none answered.
 */
export async function searchMcpCatalog(
  source: McpCatalogSource,
  query: string,
  cursor?: string,
  deps: CatalogDeps = defaultDeps,
): Promise<McpRegistrySearchResult> {
  switch (source) {
    case McpCatalogSource.GITHUB:
      return { servers: (await deps.loadGithub()).filter((s) => matchesQuery(s, query)), nextCursor: null };
    case McpCatalogSource.BUILT_IN:
      return { servers: BUILT_IN_SERVERS.filter((s) => matchesQuery(s, query)), nextCursor: null };
    case McpCatalogSource.ALL:
      return searchAll(query, deps);
    case McpCatalogSource.OFFICIAL:
    default: {
      const result = await deps.searchOfficial(query, cursor);
      return { ...result, servers: result.servers.map((s) => ({ ...s, source: McpCatalogSource.OFFICIAL })) };
    }
  }
}

async function searchAll(query: string, deps: CatalogDeps): Promise<McpRegistrySearchResult> {
  const sources = [McpCatalogSource.BUILT_IN, McpCatalogSource.OFFICIAL, McpCatalogSource.GITHUB];
  const settled = await Promise.allSettled(sources.map((s) => searchMcpCatalog(s, query, undefined, deps)));

  const servers: McpRegistryServer[] = [];
  const seen = new Set<string>();
  const unavailableSources: McpCatalogSource[] = [];
  let firstError: unknown = null;
  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      unavailableSources.push(sources[i]);
      firstError ??= result.reason;
      return;
    }
    // The same server is in both registries; the first source to list it keeps it.
    for (const server of result.value.servers) {
      if (seen.has(server.name)) continue;
      seen.add(server.name);
      servers.push(server);
    }
  });
  if (unavailableSources.length === sources.length) throw firstError;
  return { servers, nextCursor: null, ...(unavailableSources.length > 0 ? { unavailableSources } : {}) };
}
