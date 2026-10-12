import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';
import type { SessionTask } from '@/hooks/useSessionTasks';

interface Props {
  task: SessionTask;
  /** Task-list tasks have ids other tasks refer to ("waiting on #2"); TodoWrite items do not. */
  showId: boolean;
  /** A turn is running, so a task in progress is being worked on right now. */
  live: boolean;
}

function StatusMark({ status, live }: { status: SessionTask['status']; live: boolean }) {
  const { t } = useTranslation('chat');
  if (status === 'completed') {
    return <CheckCircleIcon className="w-4 h-4 shrink-0 text-state-success-fg" aria-label={t('sessionTasks.status.completed')} />;
  }
  if (status === 'in_progress') {
    return (
      <span
        className={`block w-4 h-4 shrink-0 rounded-full border-2 border-text-link ${live ? 'border-t-transparent animate-spin' : ''}`}
        aria-label={t('sessionTasks.status.in_progress')}
      />
    );
  }
  return <span className="block w-4 h-4 shrink-0 rounded-full border-2 border-border-strong" aria-label={t('sessionTasks.status.pending')} />;
}

/** One task: its mark, its title, and under it what it is doing or what it is about. */
export function TaskRow({ task, showId, live }: Props) {
  const { t } = useTranslation('chat');
  const done = task.status === 'completed';
  const running = task.status === 'in_progress';
  const detail = running && task.activeForm && task.activeForm !== task.title ? task.activeForm : task.description;

  return (
    <li className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${running ? 'bg-surface-hover' : ''}`} data-testid="session-task">
      <span className="mt-0.5 shrink-0">
        <StatusMark status={task.status} live={live} />
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${done ? 'text-text-tertiary line-through' : 'text-text-primary'} ${running ? 'font-medium' : ''}`}>
          {showId && task.id && <span className="me-1.5 text-text-tertiary tabular-nums no-underline">#{task.id}</span>}
          {task.title}
        </div>
        {detail && !done && (
          <div className={`mt-0.5 text-xs line-clamp-2 ${running ? 'text-text-link' : 'text-text-tertiary'}`}>{detail}</div>
        )}
        {(task.waitingOn.length > 0 || task.owner) && !done && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.7692rem] text-text-tertiary">
            {task.waitingOn.length > 0 && (
              <span>{t('sessionTasks.waitingOn', { ids: task.waitingOn.map((id) => `#${id}`).join(', ') })}</span>
            )}
            {task.owner && <span className="rounded bg-surface-hover px-1.5">{task.owner}</span>}
          </div>
        )}
      </div>
    </li>
  );
}
