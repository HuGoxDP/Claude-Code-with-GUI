/** The MCP marketplace's catalogs: the official registry, GitHub's, the built-in list, or all. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { McpCatalogSource, MessageType, McpTransportType } from '@/shared';
import type { McpRegistryServer } from '@/shared';
import { resources } from '@/i18n/config';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { McpMarketplace } from '../McpMarketplace';

const memory: McpRegistryServer = {
  name: 'modelcontextprotocol/memory',
  description: 'A local knowledge graph that persists across chats.',
  version: '',
  repositoryUrl: 'https://github.com/modelcontextprotocol/servers',
  config: { type: McpTransportType.STDIO, command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  requiredInputs: [],
  source: McpCatalogSource.BUILT_IN,
};
const widget: McpRegistryServer = { ...memory, name: 'io.github.acme/widget', description: 'Widgets', source: McpCatalogSource.OFFICIAL };

function renderMarketplace(onPick = vi.fn()) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <McpMarketplace onPick={onPick} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function pickSource(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
  sendMock.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
});

describe('McpMarketplace catalogs', () => {
  it('starts on the official registry and asks nothing before a search', () => {
    renderMarketplace();
    expect(screen.getByText('Search the official MCP registry to find and install servers.')).toBeTruthy();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('lists the built-in servers without a search, and remembers the catalog', async () => {
    sendMock.mockResolvedValue({ status: 'ok', servers: [memory], nextCursor: null });
    renderMarketplace();

    await pickSource('Built-in');

    expect(await screen.findByText('memory')).toBeTruthy();
    expect(sendMock).toHaveBeenCalledWith(MessageType.SEARCH_MCP_REGISTRY, { query: '', source: McpCatalogSource.BUILT_IN });
    expect(localStorage.getItem('ccg-mcp-catalog-source')).toBe(McpCatalogSource.BUILT_IN);
  });

  it('names each server\'s catalog in a list from all of them, and the ones it could not reach', async () => {
    sendMock.mockResolvedValue({
      status: 'ok',
      servers: [memory, widget],
      nextCursor: null,
      unavailableSources: [McpCatalogSource.GITHUB],
    });
    renderMarketplace();
    await pickSource('All sources');
    fireEvent.change(screen.getByPlaceholderText('Search MCP servers…'), { target: { value: 'e' } });

    expect(await screen.findByText('Not reachable right now: GitHub MCP Registry. Showing the rest.')).toBeTruthy();
    expect(screen.getByText('Built-in')).toBeTruthy();
    expect(screen.getByText('Official MCP Registry', { selector: 'span' })).toBeTruthy();
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(MessageType.SEARCH_MCP_REGISTRY, { query: 'e', source: McpCatalogSource.ALL }),
    );
  });

  it('is translated in every locale', () => {
    for (const locale of Object.keys(resources)) {
      const m = (resources[locale].common as any).mcpModal?.marketplace;
      for (const key of ['label', 'official', 'github', 'builtIn', 'all']) {
        expect(m?.source?.[key], `${locale} source.${key}`).toBeTruthy();
      }
      for (const key of ['searchPromptGithub', 'searchPromptAll', 'searchAnyPlaceholder', 'unavailable']) {
        expect(m?.[key], `${locale} ${key}`).toBeTruthy();
      }
      expect(m.unavailable, locale).toContain('{{sources}}');
    }
  });
});
