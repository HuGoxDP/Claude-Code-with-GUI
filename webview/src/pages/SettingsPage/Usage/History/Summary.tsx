import { useTranslation } from '@/i18n';
import { tokensOf, type UsageHistory } from './useUsageHistory';
import { formatCost, formatTokens } from './format';

interface Props {
  history: UsageHistory;
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border-default bg-surface-raised px-3 py-2.5">
      <div className="text-[0.7692rem] font-medium uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{value}</div>
      <div className="mt-0.5 line-clamp-2 text-[0.7692rem] text-text-tertiary" title={hint}>
        {hint}
      </div>
    </div>
  );
}

/** The period in four numbers: all tokens, output, cost and sessions. */
export function Summary({ history }: Props) {
  const { t, i18n } = useTranslation('settings');
  const lang = i18n.language;
  const { totals } = history;
  const tok = (n: number) => formatTokens(n, lang);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile
        label={t('usage.history.tokens')}
        value={tok(tokensOf(totals))}
        hint={t('usage.history.tokensHint', { input: tok(totals.input), cacheWrite: tok(totals.cacheWrite), cacheRead: tok(totals.cacheRead) })}
      />
      <Tile label={t('usage.history.output')} value={tok(totals.output)} hint={t('usage.history.repliesCount', { n: totals.replies })} />
      <Tile label={t('usage.history.cost')} value={formatCost(totals.cost, lang)} hint={t('usage.history.costHint')} />
      <Tile
        label={t('usage.history.sessions')}
        value={String(history.sessions)}
        hint={t('usage.history.projectsCount', { n: history.projects.length })}
      />
    </div>
  );
}
