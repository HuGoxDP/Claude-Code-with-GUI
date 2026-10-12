import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, utimes } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { USAGE_SLOT_MS, clearUsageHistoryCache, getUsageHistory, pricedTotal } from '../usage-history';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

let n = 0;
/** One reply as Claude Code writes it: one entry per content block, same usage on each. */
function reply(at: number, opts: { blocks?: number; model?: string; cwd?: string; session?: string; usage?: Record<string, number> } = {}) {
  const id = `msg_${++n}`;
  const usage = opts.usage ?? { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000 };
  return Array.from({ length: opts.blocks ?? 2 }, (_, i) => ({
    type: 'assistant',
    uuid: `${id}-${i}`,
    timestamp: new Date(at).toISOString(),
    sessionId: opts.session ?? 's1',
    cwd: opts.cwd ?? '/work/app',
    requestId: `req_${n}`,
    message: { id, model: opts.model ?? 'model-a', role: 'assistant', content: [{ type: 'text', text: 'x' }], usage },
  }));
}

function user(at: number, session = 's1') {
  return { type: 'user', timestamp: new Date(at).toISOString(), sessionId: session, cwd: '/work/app', message: { content: 'hi' } };
}

function costState(total: number, session = 's1', unknown = false, modelUsage: Record<string, unknown> = {}) {
  return { type: 'cost-state', sessionId: session, totalCostUSD: total, hasUnknownModelCost: unknown, modelUsage };
}

describe('getUsageHistory', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'usage-history-'));
    previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = root;
    clearUsageHistoryCache();
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });

  async function transcript(relPath: string, entries: unknown[], mtime?: number) {
    const file = join(root, 'projects', relPath);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
    if (mtime !== undefined) await utimes(file, mtime / 1000, mtime / 1000);
    return file;
  }

  it('counts each reply once, however many entries it was written as', async () => {
    await transcript('-work-app/s1.jsonl', [user(NOW - 3000), ...reply(NOW - 2000, { blocks: 3 }), ...reply(NOW - 1000, { blocks: 1 })]);
    const history = await getUsageHistory(NOW - DAY);
    const total = history.buckets.reduce((a, b) => ({ replies: a.replies + b.replies, output: a.output + b.output }), { replies: 0, output: 0 });
    expect(total).toEqual({ replies: 2, output: 200 });
    expect(history.sessions).toBe(1);
  });

  it('splits by slot, model and project, and keeps the slot start in UTC ms', async () => {
    const at = NOW - 2 * 60 * 60 * 1000;
    await transcript('-work-app/s1.jsonl', [...reply(at), ...reply(at, { model: 'model-b' })]);
    await transcript('-work-other/s2.jsonl', [...reply(at, { cwd: '/work/other', session: 's2' })]);
    const { buckets } = await getUsageHistory(NOW - DAY);
    expect(buckets.map((b) => [b.model, b.project]).sort()).toEqual([
      ['model-a', '/work/app'],
      ['model-a', '/work/other'],
      ['model-b', '/work/app'],
    ]);
    expect(buckets.every((b) => b.slot === Math.floor(at / USAGE_SLOT_MS) * USAGE_SLOT_MS)).toBe(true);
  });

  it('leaves out replies before the period, stand-in replies and replies without usage', async () => {
    await transcript('-work-app/s1.jsonl', [
      ...reply(NOW - 3 * DAY),
      ...reply(NOW - 1000, { model: '<synthetic>' }),
      ...reply(NOW - 1000, { usage: { input_tokens: 0, output_tokens: 0 } }),
      ...reply(NOW - 1000),
    ]);
    const { buckets } = await getUsageHistory(NOW - DAY);
    expect(buckets.reduce((a, b) => a + b.replies, 0)).toBe(1);
  });

  it('reads subagents, and does not count a reply copied into a fork twice', async () => {
    const original = reply(NOW - 5000);
    await transcript('-work-app/s1.jsonl', original);
    await transcript('-work-app/s1/subagents/agent-a1.jsonl', reply(NOW - 4000, { model: 'model-small' }));
    await transcript('-work-app/fork.jsonl', [...original.map((e) => ({ ...e, sessionId: 'fork' })), ...reply(NOW - 3000, { session: 'fork' })]);
    const { buckets } = await getUsageHistory(NOW - DAY);
    expect(buckets.reduce((a, b) => a + b.replies, 0)).toBe(3);
    expect(buckets.some((b) => b.model === 'model-small')).toBe(true);
  });

  it('skips a transcript last written before the period without reading it', async () => {
    await transcript('-work-app/old.jsonl', reply(NOW - 1000), NOW - 2 * DAY);
    const { buckets } = await getUsageHistory(NOW - DAY);
    expect(buckets).toEqual([]);
  });

  it('takes cost from Claude Code’s running total: what it moved within the period', async () => {
    await transcript('-work-app/s1.jsonl', [
      user(NOW - 3 * DAY),
      ...reply(NOW - 3 * DAY),
      costState(1.5), // the run that ended three days ago
      user(NOW - 2000),
      ...reply(NOW - 2000),
      costState(4), // resumed today: the total carried on from 1.5
    ]);
    const history = await getUsageHistory(NOW - DAY);
    expect(history.costBuckets.reduce((a, b) => a + b.cost, 0)).toBeCloseTo(2.5);
    expect(history.costBuckets[0].project).toBe('/work/app');
    expect(history.sessionsWithoutCost).toBe(0);
  });

  it('treats a total that went down as a new run, and a repeated total as nothing new', async () => {
    await transcript('-work-app/s1.jsonl', [
      ...reply(NOW - 4000),
      costState(2),
      ...reply(NOW - 3000),
      costState(2),
      ...reply(NOW - 2000),
      costState(0.5),
    ]);
    const history = await getUsageHistory(NOW - DAY);
    expect(history.costBuckets.reduce((a, b) => a + b.cost, 0)).toBeCloseTo(2.5);
  });

  it('says how many sessions record no cost, and when Claude Code could not price a model', async () => {
    await transcript('-work-app/s1.jsonl', [...reply(NOW - 2000), costState(1, 's1', true)]);
    await transcript('-work-app/s2.jsonl', reply(NOW - 2000, { session: 's2' }));
    const history = await getUsageHistory(NOW - DAY);
    expect(history.sessions).toBe(2);
    expect(history.sessionsWithoutCost).toBe(1);
    expect(history.unknownModelCost).toBe(true);
  });

  it('reads a transcript again only when it changed', async () => {
    const file = await transcript('-work-app/s1.jsonl', reply(NOW - 2000));
    expect((await getUsageHistory(NOW - DAY)).buckets[0].replies).toBe(1);
    await writeFile(file, [...reply(NOW - 2000), ...reply(NOW - 1000)].map((e) => JSON.stringify(e)).join('\n'));
    expect((await getUsageHistory(NOW - DAY)).buckets.reduce((a, b) => a + b.replies, 0)).toBe(2);
  });

  it('answers with nothing when there are no transcripts', async () => {
    expect(await getUsageHistory(NOW - DAY)).toMatchObject({ buckets: [], costBuckets: [], sessions: 0 });
  });

  it('prices a model Claude Code could not price with the price the user gave it', async () => {
    const gateway = (output: number) => ({ 'gw-large': { inputTokens: 1_000_000, outputTokens: output, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } });
    await transcript('-work-app/s1.jsonl', [
      ...reply(NOW - 3000, { model: 'gw-large' }),
      costState(0, 's1', true, gateway(1_000_000)),
      ...reply(NOW - 2000, { model: 'gw-large' }),
      costState(0, 's1', true, gateway(3_000_000)),
    ]);
    const unpriced = await getUsageHistory(NOW - DAY);
    expect(unpriced.costBuckets).toEqual([]);
    expect(unpriced.unknownModelCost).toBe(true);
    expect(unpriced.pricedByUser).toBe(false);

    const priced = await getUsageHistory(NOW - DAY, new Map([['gw-large', { input: 2, output: 10, cacheWrite: null, cacheRead: null }]]));
    // 1M input × $2 + 3M output × $10, per million.
    expect(priced.costBuckets.reduce((a, b) => a + b.cost, 0)).toBeCloseTo(32);
    expect(priced.unknownModelCost).toBe(false);
    expect(priced.pricedByUser).toBe(true);
  });
});

describe('pricedTotal', () => {
  const prices = new Map([['gw', { input: 1, output: null, cacheWrite: null, cacheRead: null }]]);
  const m = (model: string, cost: number, input = 1_000_000) => ({ model, input, output: 0, cacheWrite: 0, cacheRead: 0, cost });

  it('leaves models Claude Code priced alone, even when the user gave a price', () => {
    expect(pricedTotal({ total: 5, unknownModelCost: false, models: [m('gw', 5)] }, prices)).toEqual({ total: 5, byUser: false, unknown: false });
  });

  it('still says unknown for an unpriced model the user gave no price', () => {
    expect(pricedTotal({ total: 0, unknownModelCost: true, models: [m('gw', 0), m('other', 0)] }, prices)).toEqual({ total: 1, byUser: true, unknown: true });
  });

  it('keeps Claude Code’s word when its breakdown does not show the unpriced model', () => {
    expect(pricedTotal({ total: 2, unknownModelCost: true, models: [] }, prices).unknown).toBe(true);
  });
});
