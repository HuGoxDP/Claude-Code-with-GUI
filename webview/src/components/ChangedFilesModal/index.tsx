import { useCallback, useEffect, useState } from 'react';
import { DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Portal } from '@/components/Portal';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';
import { useSessionFileChanges, type SessionFileChange } from '@/hooks/useSessionFileChanges';
import { useDockLayout } from '@/pages/ChatPage/SessionHeader/dock/useDockLayout';
import { toggleDockVisible } from '@/pages/ChatPage/SessionHeader/dock/toggleDockVisible';
import { DockItemId } from '@/types/settings';
import { FileRow } from './FileRow';

interface Props {
  onClose: () => void;
}

const nameOf = (filePath: string) => filePath.split(/[\\/]/).pop() ?? filePath;

/**
 * The files Claude changed in this session (ported from CC GUI's status panel):
 * each with its diff, Open, and Revert, which puts it back to how it was before
 * Claude's first change in the session. Keep all clears the list until Claude
 * changes something again.
 */
export function ChangedFilesModal({ onClose }: Props) {
  const { t } = useTranslation('chat');
  const { files, loading, error, since, revert, keepAll, showAll, workingDir } = useSessionFileChanges(true, { freshOnOpen: true });
  const { confirmDialog, confirm } = useConfirmDialog();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDialog) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, confirmDialog]);

  const { layout, save } = useDockLayout();
  const pinned = layout.visible.includes(DockItemId.CHANGED_FILES);

  const run = useCallback(
    async (paths: string[], force: boolean) => {
      setBusy(true);
      try {
        return await revert(paths, force);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        return [];
      } finally {
        setBusy(false);
      }
    },
    [revert],
  );

  const revertOne = useCallback(
    async (file: SessionFileChange) => {
      const name = nameOf(file.filePath);
      const yes = await confirm({
        title: t('changedFiles.confirmTitle', { name }),
        message: file.status === 'added' ? t('changedFiles.confirmDelete', { name }) : t('changedFiles.confirmRevert', { name }),
        confirmLabel: t('changedFiles.revert'),
        variant: 'danger',
      });
      if (!yes) return;
      let [outcome] = await run([file.filePath], false);
      if (outcome && !outcome.ok && outcome.reason === 'changed-since') {
        const anyway = await confirm({
          title: t('changedFiles.changedSince'),
          message: t('changedFiles.confirmForce', { name }),
          confirmLabel: t('changedFiles.revertAnyway'),
          variant: 'danger',
        });
        if (!anyway) return;
        [outcome] = await run([file.filePath], true);
      }
      if (outcome?.ok) toast.success(t('changedFiles.reverted', { name }));
      else if (outcome) toast.error(t('changedFiles.revertFailed', { name, reason: outcome.error ?? t(`changedFiles.reason.${outcome.reason}`) }));
    },
    [confirm, run, t],
  );

  const revertAll = useCallback(async () => {
    const targets = files.filter((f) => f.revertable);
    const yes = await confirm({
      title: t('changedFiles.revertAll'),
      message: t('changedFiles.confirmRevertAll', { count: targets.length }),
      confirmLabel: t('changedFiles.revertAll'),
      variant: 'danger',
    });
    if (!yes) return;
    const outcomes = await run(targets.map((f) => f.filePath), false);
    const done = outcomes.filter((o) => o.ok).length;
    const left = outcomes.length - done;
    if (done > 0) toast.success(t('changedFiles.revertedCount', { count: done }));
    if (left > 0) toast.error(t('changedFiles.leftCount', { count: left }));
  }, [confirm, files, run, t]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {confirmDialog}
        <div className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border-default">
            <h2 className="flex items-center gap-2 text-md font-semibold text-text-primary">
              <DocumentTextIcon className="w-5 h-5 text-text-secondary" />
              {t('changedFiles.title')}
              {files.length > 0 && <span className="text-xs font-normal text-text-tertiary tabular-nums">{files.length}</span>}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => save(toggleDockVisible(layout, DockItemId.CHANGED_FILES))}
                className="text-xs font-medium text-accent-claude transition-opacity hover:opacity-80"
              >
                {pinned ? t('changedFiles.unpinFromDock') : t('changedFiles.pinToDock')}
              </button>
              <button
                onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
                aria-label={t('changedFiles.close')}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {since && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default text-xs text-text-tertiary">
              <span>{t('changedFiles.sinceKept')}</span>
              <button type="button" onClick={showAll} className="font-medium text-accent-claude hover:opacity-80">
                {t('changedFiles.showAll')}
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {error && <p className="text-sm text-state-error-fg">{error}</p>}
            {!error && loading && <p className="text-sm text-text-tertiary text-center py-10">{t('changedFiles.loading')}</p>}
            {!error && !loading && files.length === 0 && (
              <p className="text-sm text-text-tertiary text-center py-10">{since ? t('changedFiles.emptySinceKept') : t('changedFiles.empty')}</p>
            )}
            <ul className="flex flex-col gap-2">
              {files.map((file) => (
                <FileRow key={file.filePath} file={file} workingDir={workingDir} busy={busy} onRevert={(f) => void revertOne(f)} />
              ))}
            </ul>
          </div>

          {files.length > 0 && (
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
              <button
                type="button"
                onClick={keepAll}
                disabled={busy}
                className="rounded-lg border border-border-default px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                {t('changedFiles.keepAll')}
              </button>
              <button
                type="button"
                onClick={() => void revertAll()}
                disabled={busy || !files.some((f) => f.revertable)}
                className="rounded-lg bg-state-error-bg px-3 py-1.5 text-sm text-state-error-fg hover:opacity-90 disabled:opacity-50"
              >
                {t('changedFiles.revertAll')}
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
