import { randomUUID } from 'crypto';
import { PromptCategoryCollection } from '../entities/prompt/PromptCategory.collection';
import { PromptCategory as PromptCategoryEntity } from '../entities/prompt/PromptCategory.entity';
import { EntityChange } from '../entities/AbstractEntityCollection';
import { PromptCategoryItemLinkCollection } from '../entities/prompt/PromptCategoryItemLink.collection';
import { PROMPT_ALL_CATEGORIES_ID, PROMPT_CATEGORY_MAX_LENGTH, PromptCategory } from './prompts';

/**
 * The category records, kept apart from the prompts that reference them.
 *
 * Two reasons they are records with ids rather than bare names. A category the
 * user creates from the sidebar has no prompt in it yet, so a name written only
 * on prompts would have nothing to hang on and would vanish when the screen
 * closed. And a name written on every prompt would have to be rewritten on all
 * of them whenever it changed. The name lives here, once.
 *
 * The rows are in `prompt_categories` with no `cwd`, because a category is a
 * dimension of its own, independent of scope. The webview is handed the `uuid`
 * as the category's id; the integer id stays in this process.
 */

export type CategoryResult =
  | { status: 'ok'; categories: PromptCategory[] }
  | { status: 'error'; error: string };

/**
 * Whether two names are the same category.
 *
 * Case-insensitive, because "Debug" and "debug" are one category in every head
 * but the computer's, and letting both exist is how a taxonomy rots.
 */
export function isSameCategoryName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Category name must not be empty';
  if (trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) {
    return `Category name must be at most ${PROMPT_CATEGORY_MAX_LENGTH} characters`;
  }
  return null;
}

function toWire(category: PromptCategoryEntity): PromptCategory {
  return new PromptCategory(category.uuid, category.name, category.createdAt, category.priority);
}

/**
 * Every category in the order of the category column.
 *
 * Throws when the entity file exists and cannot be read: an empty list would look
 * like every category was lost.
 */
export async function listCategories(): Promise<PromptCategory[]> {
  return (await new PromptCategoryCollection().inColumnOrder()).map(toWire);
}

async function guarded(run: () => Promise<void>): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  try {
    await run();
    return { status: 'ok' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to write prompt categories:', err);
    return { status: 'error', error };
  }
}

/** The row after the last one, which is where a category made later has always sat. */
function bottomPriority(categories: PromptCategoryEntity[]): number {
  return categories.reduce((lowest, category) => Math.max(lowest, category.priority), 0) + 1;
}

/** Add a category, which starts with no prompts in it. */
export async function createCategory(name: string): Promise<CategoryResult> {
  const invalid = validateName(name);
  if (invalid) return { status: 'error', error: invalid };
  const trimmed = name.trim();

  let rejected: string | null = null;
  const written = await guarded(async () => {
    const collection = new PromptCategoryCollection();
    const existing = await collection.all();
    if (existing.some((category) => isSameCategoryName(category.name, trimmed))) {
      rejected = 'Category already exists';
      return;
    }
    await collection.insert(
      PromptCategoryEntity.draft(randomUUID(), trimmed, bottomPriority(existing), Date.now()),
    );
  });
  if (written.status === 'error') return written;
  if (rejected !== null) return { status: 'error', error: rejected };
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Rename a category.
 *
 * One record changes and every prompt that references it follows, because they
 * reference the id. Renaming onto a name that already exists is refused rather
 * than merging the two, which would be a bigger change than the user asked for.
 */
export async function renameCategory(id: string, name: string): Promise<CategoryResult> {
  const invalid = validateName(name);
  if (invalid) return { status: 'error', error: invalid };
  const trimmed = name.trim();

  let failure: string | null = null;
  const written = await guarded(async () => {
    const collection = new PromptCategoryCollection();
    const existing = await collection.all();
    const target = existing.find((category) => category.uuid === id);
    if (!target) {
      failure = `Category not found: ${id}`;
      return;
    }
    if (existing.some((category) => category.id !== target.id && isSameCategoryName(category.name, trimmed))) {
      failure = 'Category already exists';
      return;
    }
    target.name = trimmed;
    await collection.save(target);
  });
  if (written.status === 'error') return written;
  if (failure !== null) return { status: 'error', error: failure };
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Remove a category.
 *
 * The category row and the links into it go; the prompts stay, and one that sat
 * in no other category reads as uncategorised. Deleting the saved phrases along
 * with a grouping the user tidied up would be a surprise nobody asked for.
 */
export async function deleteCategory(id: string): Promise<CategoryResult> {
  const written = await guarded(async () => {
    const collection = new PromptCategoryCollection();
    const target = (await collection.all()).find((category) => category.uuid === id);
    if (!target) return;
    await collection.delete(target.id);
    await new PromptCategoryItemLinkCollection().mutate((links) =>
      EntityChange.write(
        links.filter((link) => link.categoryId !== target.id),
        undefined,
      ),
    );
  });
  if (written.status === 'error') return written;
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Put the category column in the order [orderedIds] gives.
 *
 * The "All" row is part of the column: [orderedIds] holds
 * {@link PROMPT_ALL_CATEGORIES_ID} at the place it should sit. It has no row of
 * its own and is fixed at priority 0, so the categories above it are stored with
 * negative priorities (the one nearest "All" is -1) and the ones below it with
 * positive ones (the one nearest is 1). A list without it keeps "All" on top.
 *
 * Categories the order does not mention keep their relative places below the
 * named ones, and ids that are not categories are ignored, so a stale drag cannot
 * fail the whole move. Answers with the column as it now stands.
 */
export async function reorderCategories(orderedIds: string[]): Promise<CategoryResult> {
  const written = await guarded(async () => {
    const collection = new PromptCategoryCollection();
    const existing = await collection.inColumnOrder();
    const idByUuid = new Map(existing.map((category) => [category.uuid, category.id]));

    // The column as a list of internal ids, with null standing for "All".
    const sequence: Array<number | null> = [];
    for (const uuid of orderedIds) {
      if (uuid === PROMPT_ALL_CATEGORIES_ID) {
        if (!sequence.includes(null)) sequence.push(null);
        continue;
      }
      const id = idByUuid.get(uuid);
      if (id !== undefined && !sequence.includes(id)) sequence.push(id);
    }
    const rest = existing.map((category) => category.id).filter((id) => !sequence.includes(id));
    // Not named: "All" stays where it has always been, on top.
    const column = sequence.includes(null) ? [...sequence, ...rest] : [null, ...sequence, ...rest];

    const allAt = column.indexOf(null);
    const priorityOf = new Map<number, number>();
    column.forEach((id, index) => {
      if (id !== null) priorityOf.set(id, index - allAt);
    });
    await collection.mutate((categories) => {
      for (const category of categories) {
        category.priority = priorityOf.get(category.id) ?? category.priority;
      }
      return EntityChange.write(categories, undefined);
    });
  });
  if (written.status === 'error') return written;
  return { status: 'ok', categories: await listCategories() };
}

/**
 * Find or create the categories for a set of names, answering with their ids.
 *
 * This is the import path: a library arriving from another machine carries ids
 * that mean nothing here, so its categories are matched by NAME against what
 * this machine already has and created when there is no match.
 */
export async function resolveCategoryIdsByName(names: string[]): Promise<Map<string, string>> {
  const wanted: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) continue;
    if (!wanted.some((existing) => isSameCategoryName(existing, trimmed))) wanted.push(trimmed);
  }
  if (wanted.length === 0) return new Map();

  await guarded(async () => {
    const collection = new PromptCategoryCollection();
    const known = await collection.all();
    for (const name of wanted) {
      if (known.some((category) => isSameCategoryName(category.name, name))) continue;
      known.push(
        await collection.insert(
          PromptCategoryEntity.draft(randomUUID(), name, bottomPriority(known), Date.now()),
        ),
      );
    }
  });

  const all = await listCategories();
  const byName = new Map<string, string>();
  for (const name of wanted) {
    const match = all.find((category) => isSameCategoryName(category.name, name));
    if (match) byName.set(name, match.id);
  }
  return byName;
}
