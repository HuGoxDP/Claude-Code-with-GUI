import { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { USAGE_PERIODS, useUsageHistory, type UsagePeriod } from './useUsageHistory';
import { Summary } from './Summary';
import { DailyChart } from './DailyChart';
import { UsageTable } from './UsageTable';
import { projectName } from './format';

/**
 * How much Claude was used over the last days (ported from CC GUI's usage
 * dashboard): tokens per day, project and model from the transcripts on this
 * machine, and cost as Claude Code itself recorded it.
 */
export function UsageHistorySection() {
  const { t } = useTranslation('settings');
  const [period, setPeriod] = useState<UsagePeriod>(7);
  const { history, loading, fetching, error, refresh } = useUsageHistory(period);
  const empty = history !== null && history.totals.replies === 0;

  return (
    <section className="mt-10 mb-8" data-testid="usage-history">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wider text-text-primary">{t('usage.history.title')}</h3>
        <div className="ml-auto flex rounded-md border border-border-default p-0.5 text-xs" role="tablist">
          {USAGE_PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              role="tab"
              aria-selected={period === days}
              onClick={() => setPeriod(days)}
              className={`rounded px-2 py-0.5 ${period === days ? 'bg-surface-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {t(`usage.history.days${days}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={fetching}
          className="rounded p-1 transition-colors hover:bg-surface-hover disabled:opacity-50"
          title={t('usage.refresh')}
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 text-text-tertiary ${fetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="mb-4 text-xs text-text-tertiary">{t('usage.history.description')}</p>

      {error && <p className="text-sm text-state-error-fg">{error}</p>}
      {!error && loading && <p className="py-8 text-center text-sm text-text-tertiary">{t('usage.history.loading')}</p>}
      {!error && empty && <p className="py-8 text-center text-sm text-text-tertiary">{t('usage.history.empty')}</p>}

      {history && !empty && (
        <div className="space-y-6">
          <Summary history={history} />
          <DailyChart days={history.days} />
          <UsageTable title={t('usage.history.byProject')} nameLabel={t('usage.history.project')} rows={history.projects} displayName={projectName} showCost />
          <UsageTable title={t('usage.history.byModel')} nameLabel={t('usage.history.model')} rows={history.models} showCost={false} />
          <div className="space-y-1 text-xs text-text-tertiary">
            <p>{t('usage.history.costNote')}</p>
            {history.sessionsWithoutCost > 0 && <p>{t('usage.history.noCost', { n: history.sessionsWithoutCost })}</p>}
            {history.unknownModelCost && <p className="text-state-warning-fg">{t('usage.history.unknownCost')}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
