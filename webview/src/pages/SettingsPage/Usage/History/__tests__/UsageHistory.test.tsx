/** The usage history: grouping into the viewer's days, the summary, the tables. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { MessageType } from '@/shared';

const send = vi.fn();
vi.mock('@/contexts/BridgeContext', () => ({ useBridgeContext: () => ({ send }) }));

import { UsageHistorySection } from '../index';
import { localDate, periodStart, summarize, type UsageHistoryResponse } from '../useUsageHistory';

const NOW = new Date(2026, 9, 12, 15, 30); // Oct 12, 15:30 local
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();

const bucket = (slot: number, over: Record<string, unknown> = {}) => ({
  slot,
  model: 'model-a',
  project: '/work/app',
  input: 10,
  output: 100,
  cacheWrite: 1000,
  cacheRead: 5000,
  replies: 1,
  ...over,
});

const response: UsageHistoryResponse = {
  since: periodStart(7, NOW),
  buckets: [
    bucket(at(12, 9)),
    bucket(at(12, 23), { model: 'model-b', output: 300 }),
    bucket(at(10, 0), { project: '/work/other' }),
  ],
  costBuckets: [
    { slot: at(12, 10), project: '/work/app', cost: 1.25 },
    { slot: at(10, 1), project: '/work/other', cost: 0.5 },
  ],
  sessions: 3,
  sessionsWithoutCost: 1,
  unknownModelCost: false,
};

describe('summarize', () => {
  it('has every day of the period, in this viewer’s local dates, empty ones too', () => {
    const { days } = summarize(response, 7, NOW);
    expect(days.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    const today = days[6];
    // 23:00 local is still today however far it is from UTC.
    expect(today.output).toBe(400);
    expect(today.cost).toBeCloseTo(1.25);
    expect(days[4].cost).toBeCloseTo(0.5);
    expect(days[5].replies).toBe(0);
  });

  it('adds up totals, and sorts projects and models by tokens with cost per project', () => {
    const h = summarize(response, 7, NOW);
    expect(h.totals.output).toBe(500);
    expect(h.totals.cost).toBeCloseTo(1.75);
    expect(h.projects.map((p) => [p.name, p.cost])).toEqual([
      ['/work/app', 1.25],
      ['/work/other', 0.5],
    ]);
    expect(h.models.map((m) => [m.name, m.replies, m.cost])).toEqual([
      ['model-a', 2, null],
      ['model-b', 1, null],
    ]);
  });

  it('starts a period at local midnight', () => {
    expect(localDate(periodStart(1, NOW))).toBe('2026-10-12');
    expect(new Date(periodStart(1, NOW)).getHours()).toBe(0);
  });
});

describe('UsageHistorySection', () => {
  beforeEach(() => {
    cleanup();
    send.mockReset().mockImplementation(async (type: string) =>
      type === MessageType.GET_USAGE_HISTORY ? { status: 'ok', ...response, buckets: response.buckets.map((b) => ({ ...b, slot: Date.now() - 60_000 })), costBuckets: [{ slot: Date.now() - 60_000, project: '/work/app', cost: 1.75 }] } : { status: 'ok' },
    );
  });

  function renderSection() {
    return render(
      <QueryClientProvider client={createTestQueryClient()}>
        <UsageHistorySection />
      </QueryClientProvider>,
    );
  }

  it('asks for the period from local midnight and shows the summary and tables', async () => {
    renderSection();
    expect(await screen.findByText('By project')).toBeTruthy();
    expect(send).toHaveBeenCalledWith(MessageType.GET_USAGE_HISTORY, { since: periodStart(7) });
    expect(screen.getAllByText('$1.75').length).toBeGreaterThan(0);
    // Projects go by their folder name, with the full path in the tooltip.
    const app = screen.getByTitle('/work/app');
    expect(app.textContent).toBe('app');
    expect(screen.getByText('By model')).toBeTruthy();
    expect(screen.getByText('Sessions with no cost recorded (older Claude Code): 1')).toBeTruthy();
    expect(screen.getAllByTestId('usage-day')).toHaveLength(7);
  });

  it('asks again for a longer period', async () => {
    renderSection();
    await screen.findByText('By project');
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }));
    await screen.findByText('By project');
    expect(send).toHaveBeenCalledWith(MessageType.GET_USAGE_HISTORY, { since: periodStart(30) });
    expect(await screen.findAllByTestId('usage-day')).toHaveLength(30);
  });

  it('says so when Claude did not reply in the period', async () => {
    send.mockResolvedValue({ status: 'ok', since: 0, buckets: [], costBuckets: [], sessions: 0, sessionsWithoutCost: 0, unknownModelCost: false });
    renderSection();
    expect(await screen.findByText('Claude did not reply in this period.')).toBeTruthy();
  });

  it('switches the chart between tokens, output and cost', async () => {
    renderSection();
    await screen.findByText('By project');
    const tabs = screen.getAllByRole('tablist')[1];
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Cost' }));
    expect(within(tabs).getByRole('tab', { name: 'Cost' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('img', { name: 'Cost' })).toBeTruthy();
  });
});
