import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { useSessionTasks } from '@/hooks/useSessionTasks';
import { openSessionTasksModal } from './dock/actions';

/**
 * Dock icon for Claude's task list, with how many of its tasks are done.
 * Hidden while the session has no list, like the background tasks icon.
 */
export function SessionTasksButton() {
  const { t } = useTranslation('chat');
  const { done, total, running, isStreaming } = useSessionTasks();
  if (total === 0) return null;

  const working = running && isStreaming;
  return (
    <button
      onClick={openSessionTasksModal}
      className="relative flex items-center gap-1 p-1 rounded transition-colors hover:bg-surface-hover"
      title={`${t('sessionTasks.title')} · ${t('sessionTasks.progress', { done, total })}`}
    >
      <ClipboardDocumentCheckIcon className={`w-5 h-5 ${working ? 'text-text-link' : 'text-text-secondary hover:text-text-primary'}`} />
      <span className={`text-[0.6923rem] font-semibold tabular-nums ${working ? 'text-text-link' : 'text-text-secondary'}`}>
        {done}/{total}
      </span>
    </button>
  );
}
