import { lazy, Suspense, useState } from 'react';
import { ArrowUturnLeftIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { getAdapter } from '@/adapters';
import { useTranslation } from '@/i18n';
import { useSessionFileDiff, type SessionFileChange } from '@/hooks/useSessionFileChanges';

const ChangedFileDiff = lazy(() => import('./ChangedFileDiff'));

interface Props {
  file: SessionFileChange;
  workingDir?: string;
  busy: boolean;
  onRevert: (file: SessionFileChange) => void;
}

/** The path shown under the name: relative to the project when it is inside it. */
export function folderOf(filePath: string, workingDir?: string): string {
  const parts = filePath.split(/[\\/]/);
  parts.pop();
  const folder = parts.join('/');
  const root = workingDir?.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalized = folder.replace(/\\/g, '/');
  if (root && (normalized === root || normalized.startsWith(`${root}/`))) {
    return normalized.slice(root.length + 1);
  }
  return normalized;
}

function Diff({ filePath }: { filePath: string }) {
  const { t } = useTranslation('chat');
  const { data, isLoading, error } = useSessionFileDiff(filePath);
  if (isLoading) return <p className="px-3 py-2 text-xs text-text-tertiary">{t('changedFiles.loading')}</p>;
  if (error || !data) return <p className="px-3 py-2 text-xs text-text-tertiary">{t('changedFiles.diffUnavailable')}</p>;
  if (data.tooLarge) return <p className="px-3 py-2 text-xs text-text-tertiary">{t('changedFiles.tooLarge')}</p>;
  return (
    <Suspense fallback={<p className="px-3 py-2 text-xs text-text-tertiary">{t('changedFiles.loading')}</p>}>
      <ChangedFileDiff filePath={filePath} before={data.before} after={data.after} />
    </Suspense>
  );
}

/** One changed file: what happened to it, its diff on demand, Open and Revert. */
export function FileRow({ file, workingDir, busy, onRevert }: Props) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const name = file.filePath.split(/[\\/]/).pop() ?? file.filePath;
  const folder = folderOf(file.filePath, workingDir);
  const added = file.status === 'added';

  const notes = [
    file.changedSince && t('changedFiles.changedSince'),
    file.missing && t('changedFiles.missing'),
    !file.revertable && t('changedFiles.notRevertable'),
  ].filter(Boolean) as string[];

  return (
    <li className="rounded-lg border border-border-default bg-surface-base">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          aria-expanded={open}
          aria-label={open ? t('changedFiles.hideDiff') : t('changedFiles.showDiff')}
          title={open ? t('changedFiles.hideDiff') : t('changedFiles.showDiff')}
        >
          {open ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </button>
        <span
          className={`shrink-0 w-4 text-center text-xs font-semibold ${added ? 'text-state-success-fg' : 'text-state-warning-fg'}`}
          title={added ? t('changedFiles.added') : t('changedFiles.modified')}
        >
          {added ? 'A' : 'M'}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void getAdapter().openFile(file.filePath).catch(() => undefined)}
            disabled={file.missing}
            className="block max-w-full truncate text-start text-sm text-text-primary hover:underline disabled:no-underline"
            title={file.filePath}
          >
            {name}
          </button>
          {folder && <div className="truncate text-xs text-text-tertiary" dir="ltr">{folder}</div>}
          {notes.length > 0 && <div className="text-xs text-state-warning-fg">{notes.join(' · ')}</div>}
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums" dir="ltr">
          <span className="text-state-success-fg">+{file.additions}</span>{' '}
          <span className="text-state-error-fg">−{file.deletions}</span>
        </span>
        <button
          type="button"
          onClick={() => onRevert(file)}
          disabled={busy || !file.revertable}
          className="shrink-0 rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
          aria-label={t('changedFiles.revert')}
          title={t('changedFiles.revert')}
        >
          <ArrowUturnLeftIcon className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="max-h-96 overflow-auto border-t border-border-default">
          <Diff filePath={file.filePath} />
        </div>
      )}
    </li>
  );
}
