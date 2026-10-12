import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';
import type { ModelPrices } from './custom-models';

/**
 * How much Claude was used over time (the usage history, ported from CC GUI's
 * usage dashboard), read from the transcripts Claude Code writes.
 *
 * Tokens: every assistant entry carries the API's `usage` for its reply. Claude
 * Code writes one entry per content block of a reply, each with the same usage,
 * so replies are counted once by `message.id` + `requestId` — which also keeps a
 * conversation copied into a fork from counting twice. Subagents' transcripts
 * (`<session>/subagents/*.jsonl`) are read too: their replies are billed like any.
 *
 * Cost: Claude Code works out its own cost (the `/cost` figure) and, when its
 * process ends, records it in the transcript as a `cost-state` entry: a running
 * total for the session, carried on when the session is resumed. The cost in a
 * period is how far that total moved in it; nothing here prices tokens itself. A
 * `cost-state` has no time of its own, so it takes the time of the entry before it.
 * Its per-model breakdown shows which models Claude Code could not price (tokens,
 * no cost); for those, and only those, the prices the user gave a custom model
 * are added.
 *
 * Results go out in 15-minute slots (UTC epoch ms) so each viewer can group them
 * into days in its own time zone — 15 minutes being the finest offset a time zone
 * has. This is a report built from the transcripts, not a transcript: entries are
 * not forwarded.
 */

/** A slot's width: the finest step of any time zone's offset (e.g. UTC+5:45). */
export const USAGE_SLOT_MS = 15 * 60 * 1000;

export interface UsageBucket {
  /** Start of the 15-minute slot, epoch ms. */
  slot: number;
  /** The model as the reply names it. */
  model: string;
  /** The working directory the session ran in. */
  project: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  replies: number;
}

export interface CostBucket {
  slot: number;
  project: string;
  /** US dollars, as Claude Code computed them. */
  cost: number;
}

export interface UsageHistory {
  since: number;
  buckets: UsageBucket[];
  costBuckets: CostBucket[];
  /** Sessions with at least one reply in the period. */
  sessions: number;
  /** Of those, sessions whose transcript records no cost (older Claude Code). */
  sessionsWithoutCost: number;
  /** Claude Code could not price some model used in the period, and the user gave no price for it. */
  unknownModelCost: boolean;
  /** Some of the cost comes from prices the user gave custom models. */
  pricedByUser: boolean;
}

interface Reply {
  key: string | null;
  at: number;
  model: string;
  project: string;
  sessionId: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** One model's running totals in a cost-state. */
interface ModelTotals {
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  cost: number;
}

interface CostPoint {
  sessionId: string;
  /** The time of the entry before it; -Infinity when there is none. */
  at: number;
  total: number;
  unknownModelCost: boolean;
  models: ModelTotals[];
}

interface FileDigest {
  mtimeMs: number;
  size: number;
  replies: Reply[];
  costs: CostPoint[];
  /** The working directory the file's entries ran in, for its cost. */
  project: string | null;
}

const digests = new Map<string, FileDigest>();

/** One copy of each repeated string (models, paths, ids) however many replies name it. */
const interned = new Map<string, string>();
function intern(value: string): string {
  const known = interned.get(value);
  if (known !== undefined) return known;
  interned.set(value, value);
  return value;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const TIMESTAMP = /"timestamp":"([^"]+)"/;

/** Read one transcript's replies and cost points. */
export async function digestTranscript(filePath: string): Promise<Omit<FileDigest, 'mtimeMs' | 'size'>> {
  const replies: Reply[] = [];
  const costs: CostPoint[] = [];
  let lastAt = -Infinity;
  let project: string | null = null;

  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const isReply = line.includes('"type":"assistant"') && line.includes('"usage"');
      const isCost = !isReply && line.includes('"type":"cost-state"');
      if (!isReply && !isCost) {
        // Only the time is needed from other entries: a cost-state takes the time before it.
        const match = TIMESTAMP.exec(line);
        if (match) {
          const at = Date.parse(match[1]);
          if (Number.isFinite(at)) lastAt = at;
        }
        if (project === null) {
          const cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(line);
          if (cwd) {
            try {
              project = intern(JSON.parse(`"${cwd[1]}"`) as string);
            } catch {
              // An unreadable path: the next entry has one too.
            }
          }
        }
        continue;
      }

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (isCost) {
        if (entry.type !== 'cost-state' || typeof entry.sessionId !== 'string') continue;
        const models: ModelTotals[] = [];
        for (const [model, usage] of Object.entries(asRecord(entry.modelUsage) ?? {})) {
          const u = asRecord(usage);
          if (!u) continue;
          models.push({
            model: intern(model),
            input: num(u.inputTokens),
            output: num(u.outputTokens),
            cacheWrite: num(u.cacheCreationInputTokens),
            cacheRead: num(u.cacheReadInputTokens),
            cost: num(u.costUSD),
          });
        }
        costs.push({
          sessionId: intern(entry.sessionId),
          at: lastAt,
          total: num(entry.totalCostUSD),
          unknownModelCost: entry.hasUnknownModelCost === true,
          models,
        });
        continue;
      }

      if (entry.type !== 'assistant') continue;
      const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
      if (Number.isFinite(at)) lastAt = at;
      const message = asRecord(entry.message);
      const usage = asRecord(message?.usage);
      if (!message || !usage || !Number.isFinite(at)) continue;
      const model = typeof message.model === 'string' ? message.model : '';
      // Claude Code's own stand-in replies (errors, interruptions) cost nothing.
      if (!model || model === '<synthetic>') continue;
      const input = num(usage.input_tokens);
      const output = num(usage.output_tokens);
      const cacheWrite = num(usage.cache_creation_input_tokens);
      const cacheRead = num(usage.cache_read_input_tokens);
      if (input + output + cacheWrite + cacheRead === 0) continue;

      const cwd = typeof entry.cwd === 'string' ? intern(entry.cwd) : null;
      if (project === null && cwd) project = cwd;
      const id = typeof message.id === 'string' ? message.id : null;
      const requestId = typeof entry.requestId === 'string' ? entry.requestId : '';
      replies.push({
        key: id ? `${id}:${requestId}` : null,
        at,
        model: intern(model),
        project: cwd ?? project ?? '',
        sessionId: intern(typeof entry.sessionId === 'string' ? entry.sessionId : ''),
        input,
        output,
        cacheWrite,
        cacheRead,
      });
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return { replies, costs, project };
}

/** Every transcript under the projects folder: sessions and their subagents. */
async function listTranscripts(): Promise<string[]> {
  const root = join(getClaudeConfigDir(), 'projects');
  const files: string[] = [];
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const projectDir of projects) {
    if (!projectDir.isDirectory() || projectDir.name.startsWith('.')) continue;
    const dir = join(root, projectDir.name);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(join(dir, entry.name));
      } else if (entry.isDirectory()) {
        const subagents = join(dir, entry.name, 'subagents');
        try {
          for (const name of await readdir(subagents)) {
            if (name.endsWith('.jsonl')) files.push(join(subagents, name));
          }
        } catch {
          // No subagents for this session.
        }
      }
    }
  }
  return files;
}

/** A file's digest, read again only when the file changed since the last time. */
async function digestOf(filePath: string, mtimeMs: number, size: number): Promise<FileDigest> {
  const cached = digests.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached;
  const digest = { mtimeMs, size, ...(await digestTranscript(filePath)) };
  digests.set(filePath, digest);
  return digest;
}

const slotOf = (at: number) => Math.floor(at / USAGE_SLOT_MS) * USAGE_SLOT_MS;

/**
 * A cost-state's total with the user's prices added for the models Claude Code
 * could not price, and whether any model is still unpriced.
 */
export function pricedTotal(point: Pick<CostPoint, 'total' | 'unknownModelCost' | 'models'>, prices: Map<string, ModelPrices>) {
  let total = point.total;
  let byUser = false;
  let unpriced = false;
  for (const m of point.models) {
    const tokens = m.input + m.output + m.cacheWrite + m.cacheRead;
    if (m.cost > 0 || tokens === 0) continue;
    const p = prices.get(m.model);
    if (!p) {
      unpriced = true;
      continue;
    }
    total += (m.input * (p.input ?? 0) + m.output * (p.output ?? 0) + m.cacheWrite * (p.cacheWrite ?? 0) + m.cacheRead * (p.cacheRead ?? 0)) / 1_000_000;
    byUser = true;
  }
  // Claude Code said a model was unpriced but the breakdown does not show which: keep its word.
  const unknown = unpriced || (point.unknownModelCost && !byUser);
  return { total, byUser, unknown };
}

/** Usage from [since] (epoch ms) until now; [prices] fill in models Claude Code could not price. */
export async function getUsageHistory(since: number, prices: Map<string, ModelPrices> = new Map()): Promise<UsageHistory> {
  const files = await listTranscripts();
  const read: FileDigest[] = [];
  for (const file of files) {
    let info;
    try {
      info = await stat(file);
    } catch {
      continue;
    }
    // Written to last before the period: nothing in it happened in the period.
    if (info.mtimeMs < since) continue;
    try {
      read.push(await digestOf(file, info.mtimeMs, info.size));
    } catch {
      // Unreadable now (removed, permissions): leave it out of this answer.
    }
  }
  // Forget files that are gone.
  const present = new Set(files);
  for (const file of digests.keys()) if (!present.has(file)) digests.delete(file);

  const seen = new Set<string>();
  const buckets = new Map<string, UsageBucket>();
  const sessions = new Set<string>();
  const sessionProject = new Map<string, string>();

  for (const digest of read) {
    for (const reply of digest.replies) {
      if (reply.at < since) continue;
      if (reply.key) {
        if (seen.has(reply.key)) continue;
        seen.add(reply.key);
      }
      sessions.add(reply.sessionId);
      if (reply.project && !sessionProject.has(reply.sessionId)) sessionProject.set(reply.sessionId, reply.project);
      const slot = slotOf(reply.at);
      const id = `${slot}\u0000${reply.model}\u0000${reply.project}`;
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = { slot, model: reply.model, project: reply.project, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, replies: 0 };
        buckets.set(id, bucket);
      }
      bucket.input += reply.input;
      bucket.output += reply.output;
      bucket.cacheWrite += reply.cacheWrite;
      bucket.cacheRead += reply.cacheRead;
      bucket.replies += 1;
    }
  }

  // Cost: how far each session's running total moved within the period.
  const points = new Map<string, { at: number; total: number; unknown: boolean; byUser: boolean; project: string | null }[]>();
  for (const digest of read) {
    for (const point of digest.costs) {
      let list = points.get(point.sessionId);
      if (!list) points.set(point.sessionId, (list = []));
      const priced = pricedTotal(point, prices);
      list.push({ at: point.at, total: priced.total, unknown: priced.unknown, byUser: priced.byUser, project: digest.project });
    }
  }
  const costBuckets = new Map<string, CostBucket>();
  let unknownModelCost = false;
  let pricedByUser = false;
  for (const [sessionId, list] of points) {
    list.sort((a, b) => a.at - b.at);
    const project = sessionProject.get(sessionId) ?? list.find((p) => p.project)?.project ?? '';
    let previous = 0;
    // A copy of the same running total (a fork carries its origin's) adds nothing.
    for (const point of list) {
      // A total that went down is a new run that started from zero.
      const delta = point.total >= previous ? point.total - previous : point.total;
      previous = point.total;
      if (point.at < since) continue;
      if (point.unknown) unknownModelCost = true;
      if (point.byUser && delta > 0) pricedByUser = true;
      if (delta <= 0) continue;
      const slot = slotOf(point.at);
      const id = `${slot}\u0000${project}`;
      const bucket = costBuckets.get(id);
      if (bucket) bucket.cost += delta;
      else costBuckets.set(id, { slot, project, cost: delta });
    }
  }

  let sessionsWithoutCost = 0;
  for (const sessionId of sessions) if (!points.has(sessionId)) sessionsWithoutCost++;

  return {
    since,
    buckets: [...buckets.values()].sort((a, b) => a.slot - b.slot),
    costBuckets: [...costBuckets.values()].sort((a, b) => a.slot - b.slot),
    sessions: sessions.size,
    sessionsWithoutCost,
    unknownModelCost,
    pricedByUser,
  };
}

/** Drop what was read; the next request reads every transcript again. */
export function clearUsageHistoryCache(): void {
  digests.clear();
  interned.clear();
}
