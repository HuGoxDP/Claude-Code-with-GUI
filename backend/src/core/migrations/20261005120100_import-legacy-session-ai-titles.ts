import { readdir, readFile } from 'fs/promises';
import { basename, join } from 'path';
import { ImportCounts, LegacyImport } from '../entities/migration/LegacyImport';
import { MigrationContext } from '../entities/migration/Migration';
import { SessionAiTitleCollection } from '../entities/session/SessionAiTitle.collection';
import { SessionAiTitle } from '../entities/session/SessionAiTitle.entity';
import { getClaudeConfigDir } from '../features/claudeConfigDir';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';

/**
 * Moves the titles this app generated for sessions out of the old
 * `.claude-code-gui-ai-titles.json` files into the `session_ai_titles` table.
 *
 * The old files sat beside the sessions they named, one per sessions folder of
 * the CLI (`~/.claude/projects/<encoded project>/`, or under `CLAUDE_CONFIG_DIR`
 * when the backend runs with one). They are found by listing that one folder,
 * which the session list reads all the time anyway. A folder is matched to its
 * project through the projects table by the CLI's own encoding of the path; a
 * folder no project encodes to still has its titles moved, without a project,
 * since a title is found by its session id alone.
 *
 * The old files are READ and never written, renamed or deleted. A title the table
 * already has for a session is left as it is, so running this again changes
 * nothing.
 *
 * A file that cannot be read is skipped and counted, and not reported for the
 * user to fix: a generated title only stands in for a session's first prompt, so
 * losing one costs a longer name in the list, not data. Telling the user to allow
 * access to a CLI folder for that would cost more than it saves.
 */

const LEGACY_FILE_NAME = '.claude-code-gui-ai-titles.json';

/** The titles of one old file, and the project its folder belongs to. */
class LegacyTitles {
  constructor(
    readonly projectId: number | null,
    /** Session id and title, in the file's order. */
    readonly titles: Array<[string, string]>,
  ) {}
}

class LegacyTitleFiles {
  constructor(
    readonly files: LegacyTitles[],
    /** Files that exist but could not be read or were not a title map. */
    readonly unreadableCount: number,
  ) {}

  get titleCount(): number {
    return this.files.reduce((sum, file) => sum + file.titles.length, 0);
  }
}

/** The usable titles of an old file: non-empty strings keyed by a session id. */
export function readLegacyTitles(value: unknown): Array<[string, string]> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      entry[0].length > 0 && typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );
}

export default class ImportLegacySessionAiTitles extends LegacyImport<LegacyTitleFiles> {
  protected async read(context: MigrationContext): Promise<LegacyTitleFiles | null> {
    const projectsRoot = join(getClaudeConfigDir(), 'projects');
    let folders: string[];
    try {
      folders = (await readdir(projectsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      // No sessions folder, so no session was ever named.
      return null;
    }

    const projectIdByFolder = new Map<string, number>();
    for (const project of await context.projects.all()) {
      // The same name the session list reads the project's sessions from.
      const folder = basename(await getProjectSessionsPath(project.path));
      if (!projectIdByFolder.has(folder)) projectIdByFolder.set(folder, project.id);
    }

    const files: LegacyTitles[] = [];
    let unreadableCount = 0;
    for (const folder of folders) {
      const filePath = join(projectsRoot, folder, LEGACY_FILE_NAME);
      let raw: string;
      try {
        raw = await readFile(filePath, 'utf-8');
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') continue;
        console.error('[node-backend]', `could not read ${filePath}:`, err instanceof Error ? err.message : err);
        unreadableCount += 1;
        continue;
      }
      if (raw.trim() === '') continue;

      let titles: Array<[string, string]> | null;
      try {
        titles = readLegacyTitles(JSON.parse(raw));
      } catch {
        titles = null;
      }
      if (titles === null) {
        console.error('[node-backend]', `${filePath} is not a map of session titles; its titles are not moved`);
        unreadableCount += 1;
        continue;
      }
      files.push(new LegacyTitles(projectIdByFolder.get(folder) ?? null, titles));
    }

    return files.length === 0 && unreadableCount === 0 ? null : new LegacyTitleFiles(files, unreadableCount);
  }

  protected async write(_context: MigrationContext, source: LegacyTitleFiles): Promise<ImportCounts> {
    const createdAt = Date.now();
    const drafts = source.files.flatMap((file) =>
      file.titles.map(([sessionId, title]) => SessionAiTitle.draft(file.projectId, sessionId, title, createdAt)),
    );
    await new SessionAiTitleCollection().insertMissing(drafts, (stored, candidate) => stored.sessionId === candidate.sessionId);
    return new ImportCounts(new Map([['session titles', source.titleCount]]), source.unreadableCount);
  }

  protected async verify(_context: MigrationContext, source: LegacyTitleFiles): Promise<void> {
    const stored = new Set((await new SessionAiTitleCollection().all()).map((row) => row.sessionId));
    const missing = source.files.flatMap((file) => file.titles).filter(([sessionId]) => !stored.has(sessionId));
    if (missing.length > 0) throw new Error(`${missing.length} session titles are missing after the move`);
  }
}
