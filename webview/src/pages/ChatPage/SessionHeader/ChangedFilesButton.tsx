import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { useSessionFileChanges } from '@/hooks/useSessionFileChanges';
import { openChangedFilesModal } from './dock/actions';

/**
 * Dock icon for the changed-files panel, with how many files the session changed.
 * Hidden while there are none, like the background tasks icon.
 */
export function ChangedFilesButton() {
  const { t } = useTranslation('chat');
  const { files } = useSessionFileChanges();
  if (files.length === 0) return null;

  return (
    <button
      onClick={openChangedFilesModal}
      className="relative p-1 rounded transition-colors hover:bg-surface-hover"
      title={t('changedFiles.title')}
    >
      <DocumentTextIcon className="w-5 h-5 text-text-secondary hover:text-text-primary" />
      <span className="absolute -top-0.5 -end-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-text-link text-text-inverse text-[0.6153rem] font-semibold leading-[14px] text-center">
        {files.length}
      </span>
    </button>
  );
}
