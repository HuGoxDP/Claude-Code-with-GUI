import { ClockIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '../../../types';
import { formatTokenCount, formatTurnDuration, turnFiguresOf } from '@/utils/turnFigures';

/**
 * The line under a finished turn: how long it took and the tokens it used.
 * Ported from CC GUI, which shows the same under its last reply.
 *
 * Cost is left out on purpose. The CLI's `result` reports it as a running total
 * for the CLI process (measured: 0.048 then 0.078 over two one-word turns),
 * which resets whenever the process does, so no figure here could honestly be
 * called "this reply".
 */
export function TurnResultRenderer({ message }: { message: LoadedMessageDto }) {
  const { t } = useTranslation('chat');
  const figures = turnFiguresOf(message);
  if (!figures) return null;

  return (
    <div
      className="flex items-center gap-1.5 ps-[26px] pb-3 text-xs text-text-secondary"
      data-testid="turn-result"
    >
      <ClockIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{t('turnResult.took', { duration: formatTurnDuration(figures.durationMs) })}</span>
      <span aria-hidden="true">·</span>
      <span
        title={t('turnResult.tokensDetail', {
          fresh: formatTokenCount(figures.freshInputTokens),
          cacheWrite: formatTokenCount(figures.cacheWriteTokens),
          cacheRead: formatTokenCount(figures.cacheReadTokens),
          output: formatTokenCount(figures.outputTokens),
        })}
      >
        {t('turnResult.tokens', { input: formatTokenCount(figures.inputTokens), output: formatTokenCount(figures.outputTokens) })}
      </span>
    </div>
  );
}
