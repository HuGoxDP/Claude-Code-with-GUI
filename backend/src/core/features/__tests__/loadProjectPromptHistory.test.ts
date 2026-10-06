import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../loadSessionMessages', async () => {
  const actual = await vi.importActual<typeof import('../loadSessionMessages')>('../loadSessionMessages');
  return { ...actual, loadActiveChain: vi.fn() };
});
vi.mock('../getSessionsList', async () => {
  const actual = await vi.importActual<typeof import('../getSessionsList')>('../getSessionsList');
  return { ...actual, collectSortKeys: vi.fn() };
});

import {
  loadProjectPromptHistory,
  PROMPT_HISTORY_PAGE_BYTES,
  type ProjectPromptHistoryCursor,
} from '../loadPromptHistory';
import { loadActiveChain, type SessionMessage } from '../loadSessionMessages';
import { collectSortKeys, type SessionSortKey } from '../getSessionsList';

/** A `user` entry the CLI would have written for a prompt the person typed. */
function prompt(sessionId: string, uuid: string, text: string): SessionMessage {
  return {
    type: 'user',
    uuid,
    sessionId,
    permissionMode: 'default',
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

function toolResult(sessionId: string, uuid: string): SessionMessage {
  return {
    type: 'user',
    uuid,
    sessionId,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
  };
}

function textOf(entry: SessionMessage): string {
  const content = (entry.message as { content: Array<{ text?: string }> }).content;
  return content.map(b => b.text ?? '').join('');
}

let chains: Record<string, SessionMessage[]>;

function project(sessions: Array<{ id: string; at: number; chain: SessionMessage[] }>) {
  chains = Object.fromEntries(sessions.map(s => [s.id, s.chain]));
  vi.mocked(collectSortKeys).mockImplementation(async () => sessions
    .filter(s => s.id in chains)
    .map((s): SessionSortKey => ({
      sessionId: s.id,
      fullPath: `/p/${s.id}.jsonl`,
      sessionsPath: '/p',
      sessionDir: '/work',
      sortedAt: s.at,
    })));
}

/** Every page the walk serves, newest first in walk order. */
async function walk(options: { excludeSessionId?: string; limit?: number } = {}) {
  const pages: string[][] = [];
  let cursor: ProjectPromptHistoryCursor | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await loadProjectPromptHistory('/work', { ...options, cursor });
    pages.push(page.entries.map(textOf).reverse());
    if (!page.hasMore) return pages;
    expect(page.next).toBeDefined();
    cursor = page.next;
  }
  throw new Error('walk did not end');
}

beforeEach(() => {
  vi.mocked(loadActiveChain).mockReset();
  vi.mocked(loadActiveChain).mockImplementation(async (_dir, id) => chains[id] ?? []);
});

describe('loadProjectPromptHistory', () => {
  it('walks the other conversations newest first, each from its newest prompt back', async () => {
    project([
      { id: 'old', at: 100, chain: [prompt('old', 'o1', 'old one'), prompt('old', 'o2', 'old two')] },
      { id: 'here', at: 300, chain: [prompt('here', 'h1', 'in this chat')] },
      { id: 'new', at: 200, chain: [prompt('new', 'n1', 'new one'), toolResult('new', 'n2'), prompt('new', 'n3', 'new two')] },
    ]);

    const page = await loadProjectPromptHistory('/work', { excludeSessionId: 'here' });

    expect(page.hasMore).toBe(false);
    // Oldest first, like a single conversation's page; reversed it is the walk.
    expect(page.entries.map(textOf)).toEqual(['old one', 'old two', 'new one', 'new two']);
    // The entries are the transcript's own, untouched.
    expect(page.entries[0]).toBe(chains.old[0]);
  });

  it('pages across conversations with no gap and no repeat', async () => {
    project([
      { id: 'a', at: 300, chain: [prompt('a', 'a1', 'a1'), prompt('a', 'a2', 'a2')] },
      { id: 'b', at: 200, chain: [prompt('b', 'b1', 'b1'), prompt('b', 'b2', 'b2'), prompt('b', 'b3', 'b3')] },
      { id: 'c', at: 100, chain: [prompt('c', 'c1', 'c1')] },
    ]);

    const pages = await walk({ limit: 2 });

    expect(pages).toEqual([['a2', 'a1'], ['b3', 'b2'], ['b1', 'c1']]);
  });

  it('ends the page at a conversation boundary and continues with the next conversation', async () => {
    project([
      { id: 'a', at: 300, chain: [prompt('a', 'a1', 'a1'), prompt('a', 'a2', 'a2')] },
      { id: 'b', at: 200, chain: [prompt('b', 'b1', 'b1')] },
    ]);

    const first = await loadProjectPromptHistory('/work', { limit: 2 });

    expect(first.entries.map(textOf)).toEqual(['a1', 'a2']);
    expect(first.hasMore).toBe(true);
    expect(first.next).toEqual({ sessionId: 'b', sortedAt: 200 });

    const second = await loadProjectPromptHistory('/work', { limit: 2, cursor: first.next });
    expect(second.entries.map(textOf)).toEqual(['b1']);
    expect(second.hasMore).toBe(false);
  });

  it('goes on after the place of a conversation that was deleted between pages', async () => {
    project([
      { id: 'a', at: 300, chain: [prompt('a', 'a1', 'a1'), prompt('a', 'a2', 'a2'), prompt('a', 'a3', 'a3')] },
      { id: 'b', at: 200, chain: [prompt('b', 'b1', 'b1')] },
    ]);
    const first = await loadProjectPromptHistory('/work', { limit: 2 });
    expect(first.next).toEqual({ sessionId: 'a', sortedAt: 300, beforeUuid: 'a2' });

    delete chains.a;
    const second = await loadProjectPromptHistory('/work', { limit: 2, cursor: first.next });

    expect(second.entries.map(textOf)).toEqual(['b1']);
  });

  it('leaves out the conversation the composer is in, on every page', async () => {
    project([
      { id: 'a', at: 300, chain: [prompt('a', 'a1', 'a1')] },
      { id: 'here', at: 250, chain: [prompt('here', 'h1', 'h1'), prompt('here', 'h2', 'h2')] },
      { id: 'b', at: 200, chain: [prompt('b', 'b1', 'b1')] },
    ]);

    const pages = await walk({ excludeSessionId: 'here', limit: 1 });

    expect(pages.flat()).toEqual(['a1', 'b1']);
  });

  it('serves an empty, finished page for a project with no other conversation', async () => {
    project([{ id: 'here', at: 1, chain: [prompt('here', 'h1', 'h1')] }]);

    expect(await loadProjectPromptHistory('/work', { excludeSessionId: 'here' })).toEqual({
      entries: [],
      hasMore: false,
    });
  });

  it('bounds a page by bytes, giving an oversized prompt a page of its own', async () => {
    const big = 'x'.repeat(PROMPT_HISTORY_PAGE_BYTES);
    project([
      { id: 'a', at: 300, chain: [prompt('a', 'a1', 'small'), prompt('a', 'a2', big)] },
      { id: 'b', at: 200, chain: [prompt('b', 'b1', 'b1')] },
    ]);

    const pages = await walk();

    expect(pages.map(p => p.map(t => (t === big ? 'BIG' : t)))).toEqual([['BIG'], ['small', 'b1']]);
  });

  it('keeps a queued prompt, which has no uuid, off the edge of a page', async () => {
    const queued = {
      type: 'queue-operation',
      operation: 'enqueue',
      content: 'typed while it ran',
      sessionId: 'a',
    } as unknown as SessionMessage;
    const removed = { ...queued, operation: 'remove' } as unknown as SessionMessage;
    project([
      { id: 'a', at: 300, chain: [prompt('a', 'a1', 'a1'), queued, removed, prompt('a', 'a2', 'a2')] },
    ]);

    const first = await loadProjectPromptHistory('/work', { limit: 2 });

    // The page reaches back to a1 rather than stopping at the queued prompt,
    // because the cursor has to be an entry with a uuid.
    expect(first.entries.map(e => (e.type === 'user' ? textOf(e) : (e as { content: string }).content)))
      .toEqual(['a1', 'typed while it ran', 'a2']);
    expect(first.hasMore).toBe(false);
  });
});
