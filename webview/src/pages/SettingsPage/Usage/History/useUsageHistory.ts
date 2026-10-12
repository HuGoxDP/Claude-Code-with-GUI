import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/** What GET_USAGE_HISTORY answers: 15-minute slots, grouped here into this viewer's days. */
export interface UsageBucket {
  slot: number;
  model: string;
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
  cost: number;
}

export interface UsageHistoryResponse {
  since: number;
  buckets: UsageBucket[];
  costBuckets: CostBucket[];
  sessions: number;
  sessionsWithoutCost: number;
  unknownModelCost: boolean;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface UsageDay extends TokenCounts {
  /** Local date, YYYY-MM-DD. */
  date: string;
  cost: number;
  replies: number;
}

export interface UsageRow extends TokenCounts {
  name: string;
  replies: number;
  /** Cost is known per project only; per model it is not recorded. */
  cost: number | null;
}

export interface UsageHistory {
  days: UsageDay[];
  totals: TokenCounts & { cost: number; replies: number };
  projects: UsageRow[];
  models: UsageRow[];
  sessions: number;
  sessionsWithoutCost: number;
  unknownModelCost: boolean;
}

export const USAGE_PERIODS = [7, 30, 90] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export const tokensOf = (c: TokenCounts) => c.input + c.output + c.cacheWrite + c.cacheRead;

/** Local midnight [days - 1] days before today: the start of a period that includes today. */
export function periodStart(days: number, now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));
  return start.getTime();
}

/** A time as this viewer's local date, YYYY-MM-DD. */
export function localDate(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const zero = (): TokenCounts => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });

function add(into: TokenCounts, from: TokenCounts): void {
  into.input += from.input;
  into.output += from.output;
  into.cacheWrite += from.cacheWrite;
  into.cacheRead += from.cacheRead;
}

/** The answer grouped into days (every day of the period, empty ones too), projects and models. */
export function summarize(res: UsageHistoryResponse, days: number, now = new Date()): UsageHistory {
  const byDay = new Map<string, UsageDay>();
  const start = new Date(periodStart(days, now));
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = localDate(d.getTime());
    byDay.set(date, { date, ...zero(), cost: 0, replies: 0 });
  }

  const totals = { ...zero(), cost: 0, replies: 0 };
  const projects = new Map<string, UsageRow>();
  const models = new Map<string, UsageRow>();
  const row = (map: Map<string, UsageRow>, name: string, cost: number | null) => {
    let r = map.get(name);
    if (!r) map.set(name, (r = { name, ...zero(), replies: 0, cost }));
    return r;
  };

  for (const b of res.buckets) {
    const day = byDay.get(localDate(b.slot));
    if (day) {
      add(day, b);
      day.replies += b.replies;
    }
    add(totals, b);
    totals.replies += b.replies;
    for (const r of [row(projects, b.project, 0), row(models, b.model, null)]) {
      add(r, b);
      r.replies += b.replies;
    }
  }
  for (const c of res.costBuckets) {
    const day = byDay.get(localDate(c.slot));
    if (day) day.cost += c.cost;
    totals.cost += c.cost;
    const r = row(projects, c.project, 0);
    r.cost = (r.cost ?? 0) + c.cost;
  }

  const byTokens = (a: UsageRow, b: UsageRow) => tokensOf(b) - tokensOf(a) || (b.cost ?? 0) - (a.cost ?? 0);
  return {
    days: [...byDay.values()],
    totals,
    projects: [...projects.values()].sort(byTokens),
    models: [...models.values()].sort(byTokens),
    sessions: res.sessions,
    sessionsWithoutCost: res.sessionsWithoutCost,
    unknownModelCost: res.unknownModelCost,
  };
}

/** Token use and Claude Code's own cost over the last [days] days, read from the transcripts. */
export function useUsageHistory(days: UsagePeriod) {
  const { send } = useBridgeContext();
  const since = periodStart(days);
  const query = useQuery({
    queryKey: ['usage-history', since],
    staleTime: 60_000,
    queryFn: async (): Promise<UsageHistoryResponse> => {
      const res = await send<UsageHistoryResponse & { status?: string; error?: string }>(MessageType.GET_USAGE_HISTORY, { since });
      if (res?.status !== 'ok') throw new Error(res?.error ?? 'Could not read the usage history');
      return res;
    },
  });
  const data = query.data;
  const history = useMemo(() => (data ? summarize(data, days) : null), [data, days]);
  return {
    history,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}
