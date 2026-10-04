import toast from 'react-hot-toast';
import { i18n } from '@/i18n';
import type { SessionExportResult } from '@/api/modules/SessionsApi';

/**
 * Run a session export and tell the user how it went. A cancelled save dialog
 * says nothing: the user already knows they cancelled it.
 */
export async function exportSessionWithFeedback(
  run: () => Promise<SessionExportResult>,
): Promise<SessionExportResult> {
  const result = await run();
  if (result.status === 'ok') {
    if (result.path) toast.success(i18n.t('common:sessionExport.saved', { path: result.path }));
    return result;
  }
  if (result.error === 'empty-session') {
    toast.error(i18n.t('common:sessionExport.empty'));
  } else {
    toast.error(i18n.t('common:sessionExport.failed', { error: result.error ?? '' }));
  }
  return result;
}

/** `/export` with no conversation to export: say so instead of doing nothing. */
export function notifyNothingToExport(): void {
  toast.error(i18n.t('common:sessionExport.noSession'));
}
