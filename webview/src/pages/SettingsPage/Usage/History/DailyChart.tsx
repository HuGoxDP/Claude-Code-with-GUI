import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { tokensOf, type UsageDay } from './useUsageHistory';
import { formatCost, formatDay, formatTokens } from './format';

export type ChartMetric = 'tokens' | 'output' | 'cost';

interface Props {
  days: UsageDay[];
}

/** Height of the drawing, in viewBox units; each day is 10 wide with a 2-unit gap. */
const H = 100;
const W = 10;

/** One bar's parts, bottom first: what to draw for each metric. */
function partsOf(day: UsageDay, metric: ChartMetric): { value: number; className: string }[] {
  if (metric === 'cost') return [{ value: day.cost, className: 'fill-state-success-fg' }];
  if (metric === 'output') return [{ value: day.output, className: 'fill-text-link' }];
  return [
    { value: day.output, className: 'fill-text-link' },
    { value: day.input + day.cacheWrite, className: 'fill-accent-claude' },
    { value: day.cacheRead, className: 'fill-text-tertiary/40' },
  ];
}

/** A bar per day of the period, for tokens, output or cost. */
export function DailyChart({ days }: Props) {
  const { t, i18n } = useTranslation('settings');
  const lang = i18n.language;
  const [metric, setMetric] = useState<ChartMetric>('tokens');
  const totalOf = (d: UsageDay) => partsOf(d, metric).reduce((a, p) => a + p.value, 0);
  const max = Math.max(...days.map(totalOf), 0);
  const middle = days[Math.floor((days.length - 1) / 2)];

  const legend =
    metric === 'tokens'
      ? [
          { label: t('usage.history.output'), className: 'bg-text-link' },
          { label: t('usage.history.legendInput'), className: 'bg-accent-claude' },
          { label: t('usage.history.legendCacheRead'), className: 'bg-text-tertiary/40' },
        ]
      : [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[0.7692rem] text-text-tertiary">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-sm ${l.className}`} />
              {l.label}
            </span>
          ))}
        </div>
        <div className="flex rounded-md border border-border-default p-0.5 text-xs" role="tablist">
          {(['tokens', 'output', 'cost'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded px-2 py-0.5 ${metric === m ? 'bg-surface-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {t(`usage.history.metric.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${days.length * W} ${H}`}
        preserveAspectRatio="none"
        className="h-32 w-full rounded-md bg-surface-sunken"
        role="img"
        aria-label={t(`usage.history.metric.${metric}`)}
      >
        {days.map((day, i) => {
          let y = H;
          const tip = t('usage.history.dayTip', {
            date: formatDay(day.date, lang),
            tokens: formatTokens(tokensOf(day), lang),
            output: formatTokens(day.output, lang),
            cost: formatCost(day.cost, lang),
          });
          return (
            <g key={day.date} data-testid="usage-day">
              <title>{tip}</title>
              <rect x={i * W} y={0} width={W} height={H} className="fill-transparent" />
              {max > 0 &&
                partsOf(day, metric).map((part, j) => {
                  const h = (part.value / max) * (H - 4);
                  y -= h;
                  return part.value > 0 ? <rect key={j} x={i * W + 1} y={y} width={W - 2} height={h} className={part.className} /> : null;
                })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[0.7692rem] text-text-tertiary tabular-nums">
        <span>{days[0] && formatDay(days[0].date, lang)}</span>
        <span>{middle && days.length > 2 && formatDay(middle.date, lang)}</span>
        <span>{days.length > 1 && formatDay(days[days.length - 1].date, lang)}</span>
      </div>
    </div>
  );
}
