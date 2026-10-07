import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BUILT_IN_SERVERS,
  loadGithubRegistry,
  matchesQuery,
  resetGithubRegistryCache,
  searchMcpCatalog,
  type CatalogDeps,
} from '../mcp-catalog';
import { McpCatalogSource, McpTransportType } from '../../../shared';
import type { McpRegistryServer } from '../../../shared';

// GitHub's registry answers in the Generic MCP Registry shape, the same as the
// official one: { servers: [{ server, _meta }], metadata: { nextCursor } }.
const page = (names: string[], nextCursor?: string) =>
  JSON.stringify({
    servers: names.map((name) => ({
      server: {
        name,
        description: `${name} server`,
        version: '1.0.0',
        packages: [{ registryType: 'npm', identifier: `${name.split('/').pop()}-mcp`, transport: { type: 'stdio' } }],
      },
      _meta: {},
    })),
    metadata: nextCursor ? { nextCursor } : {},
  });

const server = (name: string, source?: McpCatalogSource): McpRegistryServer => ({
  name,
  description: '',
  version: '',
  repositoryUrl: null,
  config: null,
  requiredInputs: [],
  ...(source ? { source } : {}),
});

beforeEach(() => resetGithubRegistryCache());

describe('built-in servers', () => {
  it('run with the command their own README gives', () => {
    const byName = Object.fromEntries(BUILT_IN_SERVERS.map((s) => [s.name, s.config]));
    expect(byName['modelcontextprotocol/fetch']).toEqual({ type: McpTransportType.STDIO, command: 'uvx', args: ['mcp-server-fetch'] });
    expect(byName['modelcontextprotocol/time']).toEqual({ type: McpTransportType.STDIO, command: 'uvx', args: ['mcp-server-time'] });
    expect(byName['modelcontextprotocol/memory']).toEqual({
      type: McpTransportType.STDIO,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    });
    expect(BUILT_IN_SERVERS.every((s) => s.source === McpCatalogSource.BUILT_IN && s.repositoryUrl)).toBe(true);
  });

  it('are all listed for an empty search, and filtered by name or description', async () => {
    expect((await searchMcpCatalog(McpCatalogSource.BUILT_IN, '')).servers).toHaveLength(BUILT_IN_SERVERS.length);
    expect((await searchMcpCatalog(McpCatalogSource.BUILT_IN, 'TIME')).servers.map((s) => s.name)).toEqual([
      'modelcontextprotocol/time',
    ]);
    expect((await searchMcpCatalog(McpCatalogSource.BUILT_IN, 'documentation')).servers.map((s) => s.name)).toEqual([
      'upstash/context7',
    ]);
  });
});

describe('matchesQuery', () => {
  it('ignores case and surrounding spaces, and an empty query matches all', () => {
    const s = { ...server('io.github.acme/Widget'), description: 'Makes widgets' };
    expect(matchesQuery(s, ' widget ')).toBe(true);
    expect(matchesQuery(s, 'makes')).toBe(true);
    expect(matchesQuery(s, 'gadget')).toBe(false);
    expect(matchesQuery(s, '')).toBe(true);
  });
});

describe("GitHub's registry", () => {
  it('reads pages by cursor, normalised like the official registry', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(page(['io.github.a/one', 'io.github.b/two'], 'c1'))
      .mockResolvedValueOnce(page(['io.github.c/three']));

    const servers = await loadGithubRegistry(fetch, 0);

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://api.mcp.github.com/v0.1/servers?limit=100');
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://api.mcp.github.com/v0.1/servers?limit=100&cursor=c1');
    expect(servers.map((s) => s.name)).toEqual(['io.github.a/one', 'io.github.b/two', 'io.github.c/three']);
    expect(servers[0].config).toMatchObject({ type: McpTransportType.STDIO, args: ['one-mcp'] });
    expect(servers.every((s) => s.source === McpCatalogSource.GITHUB)).toBe(true);
  });

  it('accepts the snake_case cursor too, and stops after five pages', async () => {
    const fetch = vi.fn().mockImplementation(async () =>
      JSON.stringify({ servers: [], metadata: { next_cursor: 'more' } }),
    );
    await loadGithubRegistry(fetch, 0);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenLastCalledWith('https://api.mcp.github.com/v0.1/servers?limit=100&cursor=more');
  });

  it('keeps what it read for an hour', async () => {
    const fetch = vi.fn().mockResolvedValue(page(['io.github.a/one']));
    await loadGithubRegistry(fetch, 0);
    await loadGithubRegistry(fetch, 59 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await loadGithubRegistry(fetch, 61 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('searchMcpCatalog', () => {
  const deps = (overrides: Partial<CatalogDeps> = {}): CatalogDeps => ({
    searchOfficial: vi.fn().mockImplementation(async (query: string) => ({
      servers: [server('io.github.a/one'), server('io.github.d/four')].filter((s) => s.name.includes(query)),
      nextCursor: 'n1',
    })),
    loadGithub: vi.fn().mockResolvedValue([
      server('io.github.a/one', McpCatalogSource.GITHUB),
      server('io.github.b/two', McpCatalogSource.GITHUB),
    ]),
    ...overrides,
  });

  it('asks the official registry itself, cursor and all, and says where the servers came from', async () => {
    const d = deps();
    const result = await searchMcpCatalog(McpCatalogSource.OFFICIAL, 'one', 'c0', d);
    expect(d.searchOfficial).toHaveBeenCalledWith('one', 'c0');
    expect(result.nextCursor).toBe('n1');
    expect(result.servers.every((s) => s.source === McpCatalogSource.OFFICIAL)).toBe(true);
  });

  it("searches GitHub's registry here", async () => {
    const result = await searchMcpCatalog(McpCatalogSource.GITHUB, 'TWO', undefined, deps());
    expect(result).toEqual({ servers: [server('io.github.b/two', McpCatalogSource.GITHUB)], nextCursor: null });
  });

  it('with all sources, lists each server once, built-in first, then official, then GitHub', async () => {
    const result = await searchMcpCatalog(McpCatalogSource.ALL, 'o', undefined, deps());
    // 'o' is in every name here, built-in ones included.
    const names = result.servers.map((s) => s.name);
    expect(names.filter((n) => n === 'io.github.a/one')).toHaveLength(1);
    expect(result.servers.find((s) => s.name === 'io.github.a/one')?.source).toBe(McpCatalogSource.OFFICIAL);
    expect(names.indexOf('modelcontextprotocol/memory')).toBeLessThan(names.indexOf('io.github.a/one'));
    expect(names.indexOf('io.github.d/four')).toBeLessThan(names.indexOf('io.github.b/two'));
    expect(result.unavailableSources).toBeUndefined();
  });

  it('with all sources, answers with those that could be reached and names the rest', async () => {
    const result = await searchMcpCatalog(
      McpCatalogSource.ALL,
      'github.a',
      undefined,
      deps({ loadGithub: vi.fn().mockRejectedValue(new Error('connect refused')) }),
    );
    expect(result.servers.map((s) => s.name)).toEqual(['io.github.a/one']);
    expect(result.unavailableSources).toEqual([McpCatalogSource.GITHUB]);
  });

  it('lets a single source fail as a whole', async () => {
    await expect(
      searchMcpCatalog(McpCatalogSource.GITHUB, 'x', undefined, deps({ loadGithub: vi.fn().mockRejectedValue(new Error('HTTP 503')) })),
    ).rejects.toThrow('HTTP 503');
  });
});
