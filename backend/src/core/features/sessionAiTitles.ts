import { EntityChange } from '../entities/AbstractEntityCollection';
import { ProjectCollection } from '../entities/project/Project.collection';
import { SessionAiTitleCollection } from '../entities/session/SessionAiTitle.collection';
import { SessionAiTitle } from '../entities/session/SessionAiTitle.entity';
import type { SessionInfo } from './extractSessionInfo';

/**
 * Titles this app generated for sessions, by session id.
 *
 * Rows live in the `session_ai_titles` entity table (see core/entities) rather
 * than in the transcript: the transcript is the CLI's, and the app does not
 * append to it. They used to sit in `.claude-code-gui-ai-titles.json` beside
 * each project's sessions; the `import-legacy-session-ai-titles` migration moved
 * them here and left those files as they were.
 */

/**
 * How long a list waits for the titles before it is shown without them.
 *
 * Entity reads wait while the startup migrations run, which is normally well
 * under a second but can be minutes when another backend holds the migration
 * lock. A generated title only stands in for the first prompt, so a list is
 * never held back for one: it shows the first prompt, and the next read has the
 * title.
 */
export const AI_TITLES_READ_DEADLINE_MS = 2000;

/**
 * The generated titles of every session, by session id, or none when they
 * cannot be read in time. Only ever displayed, so an empty map is the safe
 * failure.
 */
export async function readSessionAiTitles(): Promise<ReadonlyMap<string, string>> {
  // The read is given its own failure handling, so one that fails after the
  // deadline has already answered is logged instead of left unhandled.
  const read = new SessionAiTitleCollection().all().then(
    (rows) => new Map(rows.filter((row) => row.title.trim().length > 0).map((row) => [row.sessionId, row.title])),
    (err: unknown) => {
      console.error('[node-backend]', 'could not read the session titles:', err instanceof Error ? err.message : err);
      return new Map<string, string>();
    },
  );
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), AI_TITLES_READ_DEADLINE_MS);
    timer.unref?.();
  });
  try {
    const titles = await Promise.race([read, deadline]);
    if (titles !== null) return titles;
    console.error('[node-backend]', 'session titles were not readable in time; listing without them');
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Store [title] for [sessionId], which runs in [workingDir]. Throws when it
 * could not be stored, so a title that was not stored is never announced as the
 * session's name.
 */
export async function writeSessionAiTitle(workingDir: string, sessionId: string, title: string): Promise<void> {
  const projectId = await new ProjectCollection().idOf(workingDir);
  const titles = new SessionAiTitleCollection();
  const present = await titles.mutate((rows) => {
    const row = rows.find((candidate) => candidate.sessionId === sessionId);
    if (!row) return EntityChange.keep(rows, false);
    if (row.title === title && row.projectId === projectId) return EntityChange.keep(rows, true);
    row.title = title;
    row.projectId = projectId;
    return EntityChange.write(rows, true);
  });
  if (!present) {
    await titles.insertMissing(
      [SessionAiTitle.draft(projectId, sessionId, title, Date.now())],
      (stored, candidate) => stored.sessionId === candidate.sessionId,
    );
  }
}

/**
 * Forget the title of a session that is gone. Never throws: the session is
 * already deleted by the time this runs, and a title left behind only names a
 * session nobody can list.
 */
export async function removeSessionAiTitle(sessionId: string): Promise<void> {
  try {
    await new SessionAiTitleCollection().mutate((rows) => {
      const kept = rows.filter((row) => row.sessionId !== sessionId);
      return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
    });
  } catch (err) {
    console.error('[node-backend]', `could not forget the title of session ${sessionId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * The title a session row shows.
 *
 * A rename made in this app wins, as it always has. Next comes any name Claude
 * Code recorded itself (`--name`, `/rename`, its own generated title). A title
 * this app generated stands in for the CLI's generated one when there is none,
 * so it outranks a summary and the first prompt, as the CLI's does.
 *
 * The session list, a single row and the export all name a session through
 * here, so the three never disagree.
 */
export function displayTitle(
  info: Pick<SessionInfo, 'title' | 'titleSource'>,
  override?: string,
  generated?: string,
): string {
  if (override) return override;
  if (generated && (info.titleSource === 'summary' || info.titleSource === 'prompt')) return generated;
  return info.title;
}
