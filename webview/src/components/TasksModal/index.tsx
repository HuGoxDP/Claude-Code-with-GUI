import { ClipboardDocumentCheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useTranslation } from '@/i18n';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { useSessionTasks } from '@/hooks/useSessionTasks';
import { useDockLayout } from '@/pages/ChatPage/SessionHeader/dock/useDockLayout';
import { toggleDockVisible } from '@/pages/ChatPage/SessionHeader/dock/toggleDockVisible';
import { DockItemId } from '@/types/settings';
import { TaskRow } from './TaskRow';

interface Props {
  onClose: () => void;
}

/**
 * Claude's task list for this session (ported from CC GUI's status panel): the
 * list the terminal shows under the prompt, read from where Claude Code keeps it.
 * Read-only — Claude writes the list; this shows where it stands.
 */
export function TasksModal({ onClose }: Props) {
  const { t } = useTranslation('chat');
  const { tasks, source, done, total, loading, error, isStreaming } = useSessionTasks(true, { freshOnOpen: true });

  // Escape closes the panel and goes no further: it must not also stop a running turn.
  useEscapeLayer(() => {
    onClose();
    return true;
  });

  const { layout, save } = useDockLayout();
  const pinned = layout.visible.includes(DockItemId.SESSION_TASKS);
  const showIds = source === 'taskList';

  return (
    <Portal>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-xl max-h-[80vh] flex flex-col bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border-default">
            <h2 className="flex items-center gap-2 text-md font-semibold text-text-primary">
              <ClipboardDocumentCheckIcon className="w-5 h-5 text-text-secondary" />
              {t('sessionTasks.title')}
              {total > 0 && (
                <span className="text-xs font-normal text-text-tertiary tabular-nums">{t('sessionTasks.progress', { done, total })}</span>
              )}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => save(toggleDockVisible(layout, DockItemId.SESSION_TASKS))}
                className="text-xs font-medium text-accent-claude transition-opacity hover:opacity-80"
              >
                {pinned ? t('sessionTasks.unpinFromDock') : t('sessionTasks.pinToDock')}
              </button>
              <button
                onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
                aria-label={t('sessionTasks.close')}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {total > 0 && (
            <div
              className="h-1 bg-surface-hover"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label={t('sessionTasks.progress', { done, total })}
            >
              <div className="h-full bg-state-success-fg transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {error && <p className="text-sm text-state-error-fg">{error}</p>}
            {!error && loading && <p className="text-sm text-text-tertiary text-center py-10">{t('sessionTasks.loading')}</p>}
            {!error && !loading && total === 0 && (
              <div className="text-center py-10">
                <p className="text-sm text-text-secondary">{t('sessionTasks.empty')}</p>
                <p className="mt-1 text-xs text-text-tertiary">{t('sessionTasks.emptyHint')}</p>
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {tasks.map((task, i) => (
                <TaskRow key={task.id ?? `${i}-${task.title}`} task={task} showId={showIds} live={isStreaming} />
              ))}
            </ul>
          </div>

          {total > 0 && (
            <div className="px-4 py-2 border-t border-border-default text-[0.7692rem] text-text-tertiary">
              {source === 'taskList' ? t('sessionTasks.sourceTaskList') : t('sessionTasks.sourceTodoWrite')}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
