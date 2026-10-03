import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { entitiesRoot } from '../entities/entityPaths';
import { normalizeCwd } from '../entities/normalizeCwd';
import { PromptCategoryCollection } from '../entities/prompt/PromptCategory.collection';
import { PromptCategory as PromptCategoryEntity } from '../entities/prompt/PromptCategory.entity';
import { PromptCategoryItemLink } from '../entities/prompt/PromptCategoryItemLink.entity';
import { PromptItem } from '../entities/prompt/PromptItem.entity';
import { SystemMigration } from '../entities/system/SystemMigration.entity';
import { PromptCategoryItemLinkCollection } from '../entities/prompt/PromptCategoryItemLink.collection';
import { PromptItemCollection } from '../entities/prompt/PromptItem.collection';
import { SystemMigrationCollection } from '../entities/system/SystemMigration.collection';
import { parseCategoryIds, parseCategoryRecords, type PromptCategory } from './prompts';

/**
 * Moving the prompt library out of the old `prompts.json` files into the entity
 * files.
 *
 * The old files are READ and never written, renamed or deleted: they are the
 * backup, and going back to an older version finds them exactly as they were.
 *
 * What makes this safe to run at any time, any number of times, from several
 * backends at once:
 *
 * - Each row is added only if no row stands for it already (same `uuid` and
 *   `cwd`), and that check happens inside the write of the entity file.
 * - The record in `system_migrations` is written LAST. A run that is cut off has
 *   no record and simply runs again; a run that finished is never repeated, which
 *   is what stops prompts the user has since deleted from coming back.
 * - Before the record is written, the rows are read back and counted against what
 *   was meant to be written. A mismatch throws and leaves no record.
 *
 * The shared data goes first, because a project file points at the shared
 * categories by their old ids, which are now `uuid` values.
 */

export const PROMPTS_TO_ENTITIES = 'prompts-to-entities';

export class MigrationOptions {
  constructor(
    /** Where the old shared file lives (`<home>/.claude-code-gui/prompts.json`). Defaults to the user's home. */
    readonly home?: string,
  ) {}
}

/** What one move did. */
export class MigrationOutcome {
  promptCount?: number;
  categoryCount?: number;
  linkCount?: number;
  skippedCount?: number;

  private constructor(readonly status: 'already-moved' | 'no-source' | 'moved') {}

  /** A record says the move was done before, so nothing was touched. */
  static alreadyMoved(): MigrationOutcome {
    return new MigrationOutcome('already-moved');
  }

  /** There was no old file, so there was nothing to move and nothing is recorded. */
  static noSource(): MigrationOutcome {
    return new MigrationOutcome('no-source');
  }

  static moved(promptCount: number, categoryCount: number, linkCount: number, skippedCount: number): MigrationOutcome {
    const outcome = new MigrationOutcome('moved');
    outcome.promptCount = promptCount;
    outcome.categoryCount = categoryCount;
    outcome.linkCount = linkCount;
    outcome.skippedCount = skippedCount;
    return outcome;
  }
}

const LEGACY_DIR_NAME = '.claude-code-gui';
const LEGACY_FILE_NAME = 'prompts.json';
const VALID_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

export function legacyGlobalFile(options: MigrationOptions = new MigrationOptions()): string {
  return join(options.home ?? homedir(), LEGACY_DIR_NAME, LEGACY_FILE_NAME);
}

export function legacyProjectFile(projectPath: string): string {
  return join(projectPath, LEGACY_DIR_NAME, LEGACY_FILE_NAME);
}

class LegacyPrompt {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly content: string,
    readonly createdAt: number,
    readonly updatedAt: number,
    readonly categories: string[],
  ) {}
}

class LegacyFile {
  constructor(
    readonly prompts: LegacyPrompt[],
    readonly categories: PromptCategory[],
    /** Rows that could not be read, or that repeat an id already read. */
    readonly skippedCount: number,
  ) {}
}

/**
 * Read the old file with the same leniency the old store had: a malformed row is
 * skipped and counted, never fatal. A file that is not JSON at all throws, so the
 * move is retried later instead of the library being declared empty.
 */
async function readLegacyFile(filePath: string): Promise<LegacyFile | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  if (raw.trim() === '') return new LegacyFile([], [], 0);

  const parsed = JSON.parse(raw) as Record<string, unknown> | null;
  const rawPrompts = Array.isArray(parsed?.prompts) ? (parsed.prompts as unknown[]) : [];
  const rawCategories = Array.isArray(parsed?.categories) ? (parsed.categories as unknown[]) : [];
  const categories = parseCategoryRecords(rawCategories);
  let skippedCount = rawCategories.length - categories.length;

  const seen = new Set<string>();
  const prompts: LegacyPrompt[] = [];
  for (const entry of rawPrompts) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      skippedCount += 1;
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const { id, name, content, createdAt, updatedAt } = candidate;
    if (
      typeof id !== 'string' ||
      !VALID_ID_PATTERN.test(id) ||
      typeof name !== 'string' ||
      typeof content !== 'string' ||
      seen.has(id)
    ) {
      skippedCount += 1;
      continue;
    }
    seen.add(id);
    prompts.push(
      new LegacyPrompt(
        id,
        name,
        content,
        typeof createdAt === 'number' ? createdAt : 0,
        typeof updatedAt === 'number' ? updatedAt : 0,
        parseCategoryIds(candidate.categories),
      ),
    );
  }
  return new LegacyFile(prompts, categories, skippedCount);
}

/**
 * Move one old file into the entity files.
 *
 * [cwd] is null for the shared file, which also carries the categories, and the
 * normalized project directory for a project file.
 */
async function moveLegacyFile(filePath: string, cwd: string | null): Promise<MigrationOutcome> {
  const migrations = new SystemMigrationCollection();
  if (await migrations.hasRun(PROMPTS_TO_ENTITIES, cwd)) return MigrationOutcome.alreadyMoved();

  const legacy = await readLegacyFile(filePath);
  if (legacy === null) return MigrationOutcome.noSource();

  // The order every screen showed: newest first. A stable sort keeps the file's
  // own order for prompts made in the same millisecond.
  const ordered = [...legacy.prompts].sort((a, b) => b.createdAt - a.createdAt);

  const categories = new PromptCategoryCollection();
  if (cwd === null) {
    await categories.insertMissing(
      legacy.categories.map((category, index) =>
        PromptCategoryEntity.draft(category.id, category.name, index + 1, category.createdAt),
      ),
      (stored, candidate) => stored.uuid === candidate.uuid,
    );
  }
  const categoryIdByUuid = new Map((await categories.all()).map((category) => [category.uuid, category.id]));

  const items = new PromptItemCollection();
  await items.insertMissing(
    ordered.map((prompt, index) =>
      PromptItem.draft(cwd, prompt.id, prompt.name, prompt.content, index + 1, prompt.createdAt, prompt.updatedAt),
    ),
    (stored, candidate) => stored.uuid === candidate.uuid && stored.cwd === candidate.cwd,
  );
  const itemIdByUuid = new Map(
    (await items.where((item) => item.belongsTo(cwd))).map((item) => [item.uuid, item.id]),
  );

  // One link per category an item names. An id with no category behind it makes
  // no link, so that prompt reads as uncategorised, and is counted as skipped.
  let skippedCount = legacy.skippedCount;
  const nextPlace = new Map<number, number>();
  const wantedLinks: PromptCategoryItemLink[] = [];
  for (const prompt of ordered) {
    const itemId = itemIdByUuid.get(prompt.id);
    if (itemId === undefined) throw new Error(`prompt ${prompt.id} was not written`);
    for (const categoryUuid of prompt.categories) {
      const categoryId = categoryIdByUuid.get(categoryUuid);
      if (categoryId === undefined) {
        skippedCount += 1;
        continue;
      }
      const priority = (nextPlace.get(categoryId) ?? 0) + 1;
      nextPlace.set(categoryId, priority);
      wantedLinks.push(PromptCategoryItemLink.draft(cwd, categoryId, itemId, priority));
    }
  }
  const links = new PromptCategoryItemLinkCollection();
  await links.insertMissing(
    wantedLinks,
    (stored, candidate) =>
      stored.categoryId === candidate.categoryId && stored.itemId === candidate.itemId,
  );

  await verifyMoved(cwd, ordered, legacy, wantedLinks.length);

  const categoryCount = cwd === null ? legacy.categories.length : 0;
  await migrations.insert(
    SystemMigration.draft(
      cwd,
      PROMPTS_TO_ENTITIES,
      filePath,
      ordered.length,
      categoryCount,
      wantedLinks.length,
      skippedCount,
      Date.now(),
    ),
  );
  return MigrationOutcome.moved(ordered.length, categoryCount, wantedLinks.length, skippedCount);
}

/** Read the rows back and compare them with what was meant to be written. */
async function verifyMoved(
  cwd: string | null,
  ordered: LegacyPrompt[],
  legacy: LegacyFile,
  wantedLinkCount: number,
): Promise<void> {
  const storedItems = await new PromptItemCollection().where((item) => item.belongsTo(cwd));
  const storedUuids = new Set(storedItems.map((item) => item.uuid));
  const missingPrompts = ordered.filter((prompt) => !storedUuids.has(prompt.id));
  if (missingPrompts.length > 0) {
    throw new Error(`${missingPrompts.length} prompts are missing after the move`);
  }

  if (cwd === null) {
    const storedCategories = new Set((await new PromptCategoryCollection().all()).map((c) => c.uuid));
    const missingCategories = legacy.categories.filter((category) => !storedCategories.has(category.id));
    if (missingCategories.length > 0) {
      throw new Error(`${missingCategories.length} categories are missing after the move`);
    }
  }

  const itemIds = new Set(storedItems.map((item) => item.id));
  const storedLinks = await new PromptCategoryItemLinkCollection().where((link) => link.belongsTo(cwd));
  const linkCount = storedLinks.filter((link) => itemIds.has(link.itemId)).length;
  if (linkCount < wantedLinkCount) {
    throw new Error(`${wantedLinkCount - linkCount} category links are missing after the move`);
  }
}

// Several requests arrive at once when the library opens, and each of them waits
// for the move. They share one run per data location, and a run that succeeded is
// remembered so later requests do not even look at the disk.
const inFlight = new Map<string, Promise<MigrationOutcome>>();
const settled = new Set<string>();

function runOnce(key: string, run: () => Promise<MigrationOutcome>): Promise<MigrationOutcome> {
  if (settled.has(key)) return Promise.resolve(MigrationOutcome.alreadyMoved());
  const running = inFlight.get(key);
  if (running) return running;

  const started = run()
    .then((outcome) => {
      // "No source" is not settled: an older version may still write the file.
      if (outcome.status !== 'no-source') settled.add(key);
      return outcome;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** Forget what has been moved in this process. For tests. */
export function resetMigrationMemory(): void {
  inFlight.clear();
  settled.clear();
}

/** Move the shared file, if it has not been moved. Throws when it could not be. */
export function ensureGlobalMigrated(options: MigrationOptions = new MigrationOptions()): Promise<MigrationOutcome> {
  const filePath = legacyGlobalFile(options);
  return runOnce(`${entitiesRoot()}|global`, () => moveLegacyFile(filePath, null));
}

/**
 * Move one project's file, if it has not been moved. The shared data goes first.
 * Throws when either could not be moved.
 */
export async function ensureProjectMigrated(
  projectPath: string,
  options: MigrationOptions = new MigrationOptions(),
): Promise<MigrationOutcome> {
  await ensureGlobalMigrated(options);
  const cwd = normalizeCwd(projectPath);
  return runOnce(`${entitiesRoot()}|${cwd}`, () => moveLegacyFile(legacyProjectFile(projectPath), cwd));
}

export class KnownProjectsSummary {
  constructor(
    public checked = 0,
    public moved = 0,
    public failed = 0,
  ) {}
}

/**
 * Move the project files of the projects already known, one at a time.
 *
 * A failure on one project is counted and does not stop the others: it is
 * retried the next time that project is opened.
 */
export async function migrateKnownProjects(
  projectPaths: string[],
  options: MigrationOptions = new MigrationOptions(),
): Promise<KnownProjectsSummary> {
  await ensureGlobalMigrated(options);
  const summary = new KnownProjectsSummary();
  for (const projectPath of new Set(projectPaths)) {
    summary.checked += 1;
    try {
      const outcome = await ensureProjectMigrated(projectPath, options);
      if (outcome.status === 'moved') summary.moved += 1;
    } catch (err) {
      summary.failed += 1;
      console.error('[node-backend]', `Failed to move the prompts of ${projectPath}:`, err);
    }
  }
  return summary;
}
