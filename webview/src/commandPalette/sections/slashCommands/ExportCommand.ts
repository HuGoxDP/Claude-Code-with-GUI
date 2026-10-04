import { SlashCommand } from '../../types';
import { i18n } from '@/i18n';
import { exportSessionWithFeedback, notifyNothingToExport } from '@/utils/sessionExportFeedback';
import type { SessionExportOptions, SessionExportResult } from '@/api/modules/SessionsApi';

/**
 * Whether an already-trimmed input is `/export` — alone, or followed by
 * whitespace and a file name (`/export notes.md`). `/exporter` is another word.
 */
export function matchesExportCommand(trimmed: string): boolean {
  return /^\/export(\s|$)/.test(trimmed);
}

/** The file name typed after `/export`, if any. */
export function exportFileNameOf(trimmed: string): string | undefined {
  const rest = trimmed.replace(/^\/export/, '').trim();
  return rest ? rest : undefined;
}

/**
 * Export the current conversation, the way `/export` does in the terminal.
 * Shared by the typed command and the palette entry.
 */
export async function runExportCommand(
  sessionId: string | null,
  exportSession: ((id: string, options?: SessionExportOptions) => Promise<SessionExportResult>) | undefined,
  fileName?: string,
): Promise<void> {
  if (!sessionId || !exportSession) {
    notifyNothingToExport();
    return;
  }
  await exportSessionWithFeedback(() => exportSession(sessionId, fileName ? { fileName } : {}));
}

/**
 * Local override for the CLI's `/export`.
 *
 * The terminal writes the conversation to a file; a stream-json session refuses
 * the command ("isn't available in this environment"), so the GUI saves the
 * session itself through the Bridge's save dialog. Registered in
 * `localCommands`, so it shadows a CLI-provided `/export` entry.
 */
export class ExportCommand extends SlashCommand {
  readonly id = 'cmd-export';
  readonly label = '/export';

  get description(): string {
    return i18n.t('commandPalette:slashCommands.exportDescription');
  }

  async execute(): Promise<void> {
    const { session } = this.getServices();
    await runExportCommand(session.currentSessionId, session.exportSession);
  }
}
