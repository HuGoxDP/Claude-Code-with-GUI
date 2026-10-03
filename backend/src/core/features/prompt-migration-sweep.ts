import { readdir, realpath, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { SystemMigrationCollection } from '../entities/system/SystemMigration.collection';
import { SystemMigration } from '../entities/system/SystemMigration.entity';
import {
  ensureGlobalMigrated,
  ensureProjectMigrated,
  legacyProjectFile,
  migrateKnownProjects,
  MigrationOptions,
} from './prompt-migration';

/**
 * Looking through the whole home folder for project prompt files the other ways
 * of finding them missed.
 *
 * The other ways are the projects already known and the project being opened.
 * This one finds the rest in one pass, so the user does not have to open every
 * old project once to bring its prompts along. It runs in the background, one
 * folder at a time, and gives the event loop back between folders so the backend
 * stays responsive.
 *
 * Where it does NOT look:
 *
 * - Folders that are large and never hold a project of the user's: package
 *   caches, build output, version-control internals, the OS library folders.
 * - On macOS, `Desktop`, `Documents` and `Downloads`. Reading inside them from a
 *   background process can put a permission dialog in front of the user, and a
 *   dialog nobody asked for is worse than a project found a little later. The
 *   projects there are still moved when they are known or opened.
 *
 * A finished pass is recorded in `system_migrations`. One that is cut off (the
 * IDE closes) has no record and starts again from the beginning next time.
 */

export const PROMPTS_HOME_SWEEP = 'prompts-home-sweep';

/** Folder names never entered, wherever they are. */
const SKIPPED_EVERYWHERE = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.npm',
  '.pnpm-store',
  '.yarn',
  '.gradle',
  '.m2',
  '.cargo',
  '.rustup',
  '.nvm',
  '.volta',
  '.Trash',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
  '.next',
  '.nuxt',
  '$Recycle.Bin',
  // Holds a project's own settings and, in the home folder, every transcript.
  '.claude',
  'AppData',
  'Library',
]);

/** Folders under the home folder itself that macOS guards with a permission dialog. */
const MACOS_PROTECTED = new Set(['Desktop', 'Documents', 'Downloads']);

/** Deeper than any real project tree, so a pathological layout cannot run for long. */
const MAX_DEPTH = 12;

export class SweepOptions extends MigrationOptions {
  constructor(
    home?: string,
    /** Which platform's rules apply. Defaults to this machine's. */
    readonly platform?: NodeJS.Platform,
    /** Checked between folders; the pass stops, unrecorded, once it answers true. */
    readonly shouldStop?: () => boolean,
  ) {
    super(home);
  }

  /** The same options with another way to ask for a stop. */
  withStop(shouldStop: () => boolean): SweepOptions {
    return new SweepOptions(this.home, this.platform, shouldStop);
  }
}

export class SweepSummary {
  constructor(
    /** Folders looked into. */
    public visited: number,
    /** Project prompt files found. */
    public found: number,
    /** Project prompt files moved by this pass. */
    public moved: number,
    /** Project prompt files that could not be moved this time. */
    public failed: number,
    /** False when the pass was stopped before it covered the home folder. */
    public completed: boolean,
  ) {}

  /** The same counts with another verdict on whether the pass finished. */
  withCompleted(completed: boolean): SweepSummary {
    return new SweepSummary(this.visited, this.found, this.moved, this.failed, completed);
  }
}

/** What a walk over the home folder found. */
export class FoundProjects {
  constructor(
    readonly projects: string[],
    readonly completed: boolean,
  ) {}
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * The project folders under [home] that carry an old prompt file.
 *
 * Symbolic links are followed, and a folder is looked into once however many
 * links lead to it, by its real path: two spellings of one project must not be
 * found twice, and a link pointing back up must not make the walk circle.
 */
export async function findProjectsWithPromptFiles(
  home: string,
  options: SweepOptions = new SweepOptions(),
  onVisit: () => void = () => {},
): Promise<FoundProjects> {
  const platform = options.platform ?? process.platform;
  const shouldStop = options.shouldStop ?? (() => false);
  const rootReal = await realpath(home).catch(() => home);
  const seen = new Set<string>([rootReal]);
  const projects = new Set<string>();

  // A queue and not recursion, so the walk can stop between any two folders.
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootReal, depth: 0 }];

  while (queue.length > 0) {
    if (shouldStop()) return new FoundProjects([...projects], false);
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    onVisit();
    await yieldToEventLoop();

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable, or gone since it was listed
    }

    for (const entry of entries) {
      if (SKIPPED_EVERYWHERE.has(entry.name)) continue;
      if (platform === 'darwin' && depth === 0 && MACOS_PROTECTED.has(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const path = join(dir, entry.name);
      let real: string;
      try {
        real = await realpath(path);
        if (!(await stat(real)).isDirectory()) continue;
      } catch {
        continue; // a link to nothing
      }
      if (seen.has(real)) continue;
      seen.add(real);

      // The old file sits in `<project>/.claude-code-gui/`. The one directly under
      // home is the shared store, which is not a project.
      if (entry.name === '.claude-code-gui') {
        if (dir !== rootReal && (await hasPromptFile(dir))) projects.add(dir);
        continue;
      }
      if (depth + 1 < MAX_DEPTH) queue.push({ dir: real, depth: depth + 1 });
    }
  }
  return new FoundProjects([...projects], true);
}

async function hasPromptFile(projectDir: string): Promise<boolean> {
  try {
    return (await stat(legacyProjectFile(projectDir))).isFile();
  } catch {
    return false;
  }
}

/**
 * Run one pass over the home folder and move every project file it finds.
 *
 * The shared data is moved first. Answers without doing anything when a finished
 * pass is already recorded.
 */
export async function sweepHomeForPromptFiles(
  options: SweepOptions = new SweepOptions(),
): Promise<SweepSummary> {
  const home = options.home ?? homedir();
  await ensureGlobalMigrated(options);

  const migrations = new SystemMigrationCollection();
  if (await migrations.hasRun(PROMPTS_HOME_SWEEP, null)) {
    return new SweepSummary(0, 0, 0, 0, true);
  }

  let visited = 0;
  const { projects, completed } = await findProjectsWithPromptFiles(home, options, () => {
    visited += 1;
  });

  const summary = new SweepSummary(visited, projects.length, 0, 0, completed);
  let promptCount = 0;
  let linkCount = 0;
  let skippedCount = 0;
  for (const project of projects) {
    if (options.shouldStop?.()) return summary.withCompleted(false);
    try {
      const outcome = await ensureProjectMigrated(project, options);
      if (outcome.status === 'moved') {
        summary.moved += 1;
        promptCount += outcome.promptCount ?? 0;
        linkCount += outcome.linkCount ?? 0;
        skippedCount += outcome.skippedCount ?? 0;
      }
    } catch (err) {
      summary.failed += 1;
      console.error('[node-backend]', `Failed to move the prompts of ${project}:`, err);
    }
  }

  // Recorded only when the walk covered everything and nothing was left behind,
  // so a project that failed is found again by the next pass.
  if (completed && summary.failed === 0) {
    await migrations.insert(
      SystemMigration.draft(null, PROMPTS_HOME_SWEEP, home, promptCount, 0, linkCount, skippedCount, Date.now()),
    );
  }
  return summary.withCompleted(completed && summary.failed === 0);
}

let started = false;
let stopRequested = false;

/** Forget that a background pass was started, and let a stopped one run. For tests. */
export function resetBackgroundMigration(): void {
  started = false;
  stopRequested = false;
}

/** Ask a running background pass to stop at the next folder. */
export function stopBackgroundMigration(): void {
  stopRequested = true;
}

/**
 * Start the two background moves, once per process, without making the request
 * that triggered them wait: first the projects already known, then one pass over
 * the whole home folder.
 *
 * Both only run after the shared data has been moved, which the caller has just
 * ensured. A failure is logged and left to the safety net, since the move is
 * tried again whenever that project's library is opened.
 */
export function startBackgroundMigration(
  listProjectPaths: () => Promise<string[]>,
  options: SweepOptions = new SweepOptions(),
): void {
  if (started) return;
  started = true;

  void (async () => {
    try {
      const known = await migrateKnownProjects(await listProjectPaths(), options);
      console.log(
        '[node-backend]',
        `Checked ${known.checked} known projects for old prompt files: ${known.moved} moved, ${known.failed} failed`,
      );
      const swept = await sweepHomeForPromptFiles(
        options.withStop(() => stopRequested || (options.shouldStop?.() ?? false)),
      );
      console.log(
        '[node-backend]',
        `Looked through ${swept.visited} folders for old prompt files: ${swept.found} found, ${swept.moved} moved, ${swept.failed} failed${swept.completed ? '' : ' (not finished)'}`,
      );
    } catch (err) {
      console.error('[node-backend]', 'Failed to look for old prompt files:', err);
    }
  })();
}
