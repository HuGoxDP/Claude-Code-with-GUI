import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { tokensOf, type UsageRow } from './useUsageHistory';
import { formatCost, formatTokens } from './format';

interface Props {
  title: string;
  nameLabel: string;
  rows: UsageRow[];
  /** Shown instead of the full name; the full name stays in the tooltip. */
  displayName?: (name: string) => string;
  showCost: boolean;
}

const FIRST = 6;

/** Tokens (and, for projects, cost) per project or per model, largest first. */
export function UsageTable({ title, nameLabel, rows, displayName, showCost }: Props) {
  const { t, i18n } = useTranslation('settings');
  const lang = i18n.language;
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, FIRST);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">{title}</h4>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-[0.7692rem] text-text-tertiary">
            <th className="pb-1 font-medium">{nameLabel}</th>
            <th className="w-20 pb-1 text-right font-medium">{t('usage.history.tokens')}</th>
            <th className="w-20 pb-1 text-right font-medium">{t('usage.history.output')}</th>
            {showCost && <th className="w-20 pb-1 text-right font-medium">{t('usage.history.cost')}</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.name} className="border-t border-border-subtle">
              <td className="truncate py-1.5 pr-2 text-text-primary" title={row.name || undefined}>
                {row.name ? (displayName ? displayName(row.name) : row.name) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums text-text-secondary">{formatTokens(tokensOf(row), lang)}</td>
              <td className="py-1.5 text-right tabular-nums text-text-secondary">{formatTokens(row.output, lang)}</td>
              {showCost && (
                <td className="py-1.5 text-right tabular-nums text-text-secondary">{row.cost ? formatCost(row.cost, lang) : '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FIRST && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs text-text-link hover:underline">
          {all ? t('usage.history.showFewer') : t('usage.history.showAll', { n: rows.length })}
        </button>
      )}
    </div>
  );
}
