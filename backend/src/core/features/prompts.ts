import { randomUUID } from 'crypto';
import { normalizeCwd } from '../entities/normalizeCwd';
import { PromptCategoryCollection } from '../entities/prompt/PromptCategory.collection';
import { PromptCategoryItemLinkCollection } from '../entities/prompt/PromptCategoryItemLink.collection';
import { PromptItemCollection } from '../entities/prompt/PromptItem.collection';
import type { PromptItem } from '../entities/prompt/PromptItem.entity';

/**
 * The prompt library: phrases the user saves once and pastes into the composer
 * with `!!`, instead of retyping them every session.
 *
 * This is OUR store, not the CLI's. The Claude Code CLI has no equivalent
 * feature — its custom slash commands under `.claude/commands/` are EXECUTED
 * when sent, while a saved prompt is text the user pastes, reads and edits
 * before sending. Keeping the two apart is deliberate: writing saved phrases
 * into `.claude/commands/` would make every one of them an executable command
 * in the CLI's `/` list, which is not what the user asked the library to be.
 *
 * Rows live in the entity files under the user data directory (see
 * core/entities): prompts in `prompt_items`, categories in `prompt_categories`
 * and the many-to-many between them in `prompt_category_item_links`. A prompt of
 * the global scope has no `cwd`; a project prompt carries its project's.
 *
 * Everything this module hands out is the WIRE shape the webview has always been
 * given: ids are the `uuid` column, and a prompt's `categories` are category
 * uuids. The integer `id` never leaves the backend.
 */

/** Where one prompt is stored. Independent of any category it may carry. */
export type PromptScope = 'global' | 'project';

/** One saved prompt, in the shape the webview receives. */
export interface SavedPrompt {
  /** Stable identifier (the `uuid` column), assigned on creation and never rewritten. */
  id: string;
  /** Display name, shown in the `!!` panel and on the settings card. */
  name: string;
  /** The text pasted into the composer when the user picks this prompt. */
  content: string;
  /** Creation time in epoch milliseconds. */
  createdAt: number;
  /** Last edit time in epoch milliseconds. Equals createdAt until first edit. */
  updatedAt: number;
  /**
   * The uuids of the categories this prompt belongs to, or absent for the
   * uncategorised group.
   *
   * A list rather than one id: "review this diff" is both a review prompt and a
   * git prompt, and making the user pick one would push them into inventing a
   * category that means both.
   */
  categories?: string[];
}

/**
 * One category, named once and referenced by its uuid.
 *
 * Categories belong to no project: one set spans both scopes.
 */
export interface PromptCategory {
  /** The `uuid` column. */
  id: string;
  /** What the user called it. The only place this name is written. */
  name: string;
  /** Creation time in epoch milliseconds. */
  createdAt: number;
}

export type PromptResult =
  | { status: 'ok'; prompt: SavedPrompt }
  | { status: 'error'; error: string };

export type PromptDeleteResult =
  | { status: 'ok' }
  | { status: 'error'; error: string };

/**
 * Name and content limits.
 *
 * The name sits on one row of a dropdown, so it has to stay scannable; 60
 * characters is long enough for a sentence-shaped Korean name and still short
 * enough to read at a glance. The content limit only exists to stop a pasted
 * file from becoming a prompt by accident.
 */
export const PROMPT_NAME_MAX_LENGTH = 60;
/** Same reasoning as the name: a category sits on one sidebar row. */
export const PROMPT_CATEGORY_MAX_LENGTH = 60;
/**
 * A ceiling on how many categories one prompt may carry.
 *
 * Not a design limit so much as a guard: the field is free text arriving over
 * IPC, and a list with no bound is a list something can fill.
 */
export const PROMPT_CATEGORIES_MAX_COUNT = 20;
export const PROMPT_CONTENT_MAX_LENGTH = 100000;

/** Ids on the wire are uuids we generated, so reject anything that did not come from us. */
const VALID_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

/**
 * Read the category ids written on a prompt.
 *
 * Only well-formed ids are kept. Duplicates are collapsed, because one category
 * twice on one prompt would file it under the same heading twice.
 */
export function parseCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!VALID_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= PROMPT_CATEGORIES_MAX_COUNT) break;
  }
  return ids;
}

/** Read the category records of an export file, dropping anything that is not one. */
export function parseCategoryRecords(value: unknown): PromptCategory[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const categories: PromptCategory[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const { id, name, createdAt } = candidate;
    if (typeof id !== 'string' || !VALID_ID_PATTERN.test(id) || seenIds.has(id)) continue;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > PROMPT_CATEGORY_MAX_LENGTH) continue;
    seenIds.add(id);
    categories.push({
      id,
      name: trimmed,
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
    });
  }
  return categories;
}

type ScopeCwd = { status: 'ok'; cwd: string | null } | { status: 'error'; error: string };

/**
 * The `cwd` a scope's rows carry: null for global, the normalized project
 * directory for project scope, or an error when project scope names no project.
 */
export function resolveScopeCwd(scope: PromptScope, projectPath?: string): ScopeCwd {
  if (scope === 'global') return { status: 'ok', cwd: null };
  if (!projectPath) return { status: 'error', error: 'projectPath required for project scope' };
  try {
    return { status: 'ok', cwd: normalizeCwd(projectPath) };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** The prompts of one scope in wire shape, in the library's order, and what they are filed under. */
interface ScopeSnapshot {
  items: PromptItem[];
  /** Category internal id → uuid, for every category that exists. */
  categoryUuidById: Map<number, string>;
  /** Item internal id → category uuids, in the order the item was filed. */
  categoriesOfItem: Map<number, string[]>;
}

async function snapshotScope(cwd: string | null): Promise<ScopeSnapshot> {
  const [items, categories, links] = await Promise.all([
    new PromptItemCollection().inScope(cwd),
    new PromptCategoryCollection().all(),
    new PromptCategoryItemLinkCollection().where((link) => link.belongsTo(cwd)),
  ]);

  const categoryUuidById = new Map(categories.map((category) => [category.id, category.uuid]));
  const categoriesOfItem = new Map<number, string[]>();
  for (const link of [...links].sort((a, b) => a.id - b.id)) {
    const uuid = categoryUuidById.get(link.categoryId);
    if (uuid === undefined) continue;
    const filed = categoriesOfItem.get(link.itemId) ?? [];
    filed.push(uuid);
    categoriesOfItem.set(link.itemId, filed);
  }
  return { items, categoryUuidById, categoriesOfItem };
}

function toWire(item: PromptItem, snapshot: ScopeSnapshot): SavedPrompt {
  const categories = snapshot.categoriesOfItem.get(item.id) ?? [];
  return {
    id: item.uuid,
    name: item.name,
    content: item.content,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(categories.length === 0 ? {} : { categories }),
  };
}

/**
 * Read one scope's prompts in the library's own order ("All" order).
 *
 * Unlike a missing project, an entity file that exists and cannot be read throws:
 * an empty list would look like every prompt was lost, and the caller must say
 * that the library could not be loaded instead.
 */
export async function readPrompts(scope: PromptScope, projectPath?: string): Promise<SavedPrompt[]> {
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return [];
  const snapshot = await snapshotScope(resolved.cwd);
  return snapshot.items.map((item) => toWire(item, snapshot));
}

/**
 * The order of the prompts inside each category, for one scope: category uuid to
 * the prompt uuids filed under it, top first.
 */
export async function readPromptOrderByCategory(
  scope: PromptScope,
  projectPath?: string,
): Promise<Record<string, string[]>> {
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return {};

  const [items, categories, links] = await Promise.all([
    new PromptItemCollection().inScope(resolved.cwd),
    new PromptCategoryCollection().all(),
    new PromptCategoryItemLinkCollection().where((link) => link.belongsTo(resolved.cwd)),
  ]);
  const itemUuidById = new Map(items.map((item) => [item.id, item.uuid]));

  const order: Record<string, string[]> = {};
  for (const category of categories) {
    const uuids = links
      .filter((link) => link.categoryId === category.id)
      .sort((a, b) => a.priority - b.priority)
      .map((link) => itemUuidById.get(link.itemId))
      .filter((uuid): uuid is string => uuid !== undefined);
    if (uuids.length > 0) order[category.uuid] = uuids;
  }
  return order;
}

function validateNameAndContent(name: string, content: string): string | null {
  const trimmedName = name.trim();
  if (trimmedName === '') return 'Prompt name must not be empty';
  if (trimmedName.length > PROMPT_NAME_MAX_LENGTH) {
    return `Prompt name must be at most ${PROMPT_NAME_MAX_LENGTH} characters`;
  }
  if (content === '') return 'Prompt content must not be empty';
  if (content.length > PROMPT_CONTENT_MAX_LENGTH) {
    return `Prompt content must be at most ${PROMPT_CONTENT_MAX_LENGTH} characters`;
  }
  return null;
}

/** Move every item of [cwd] down [by] places, making room at the top. */
async function makeRoomAtTop(items: PromptItemCollection, cwd: string | null, by: number): Promise<void> {
  await items.mutate((rows) => {
    if (!rows.some((row) => row.cwd === cwd)) return { rows, result: undefined };
    return {
      rows: rows.map((row) => (row.cwd === cwd ? { ...row, priority: row.priority + by } : row)),
      result: undefined,
    };
  });
}

/** File [itemId] under [categoryId] at the top of that category's own order. */
async function fileOnTop(
  links: PromptCategoryItemLinkCollection,
  cwd: string | null,
  categoryId: number,
  itemId: number,
): Promise<void> {
  await links.mutate((rows) => {
    const shifted = rows.map((row) =>
      row.cwd === cwd && row.categoryId === categoryId ? { ...row, priority: row.priority + 1 } : row,
    );
    return { rows: shifted, result: undefined };
  });
  await links.create({ cwd, categoryId, itemId, priority: 1 });
}

/** The internal ids of the categories among [uuids] that exist, in the order given. */
async function existingCategoryIds(uuids: string[]): Promise<number[]> {
  if (uuids.length === 0) return [];
  const categories = await new PromptCategoryCollection().all();
  const idByUuid = new Map(categories.map((category) => [category.uuid, category.id]));
  return uuids.map((uuid) => idByUuid.get(uuid)).filter((id): id is number => id !== undefined);
}

interface NewPromptFields {
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  uuid: string;
}

/** Add one prompt at the top of its scope, filed at the top of each category it names. */
async function addAtTop(
  cwd: string | null,
  fields: NewPromptFields,
  categoryUuids: string[],
): Promise<PromptItem> {
  const items = new PromptItemCollection();
  const links = new PromptCategoryItemLinkCollection();

  await makeRoomAtTop(items, cwd, 1);
  const item = await items.create({ cwd, priority: 1, ...fields });
  for (const categoryId of await existingCategoryIds(categoryUuids)) {
    await fileOnTop(links, cwd, categoryId, item.id);
  }
  return item;
}

/** Add one prompt to a scope. The backend owns the id and both timestamps. */
export async function createPrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  name: string,
  content: string,
  categories?: unknown,
): Promise<PromptResult> {
  const validationError = validateNameAndContent(name, content);
  if (validationError) return { status: 'error', error: validationError };
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const now = Date.now();
    const item = await addAtTop(
      resolved.cwd,
      { uuid: randomUUID(), name: name.trim(), content, createdAt: now, updatedAt: now },
      parseCategoryIds(categories),
    );
    const snapshot = await snapshotScope(resolved.cwd);
    return { status: 'ok', prompt: toWire(item, snapshot) };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/**
 * Edit one prompt's name, content and categories. `id` and `createdAt` are not
 * editable: the id is what the webview's cached rows are keyed by.
 */
export async function updatePrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  id: string,
  name: string,
  content: string,
  categories?: unknown,
): Promise<PromptResult> {
  if (!VALID_ID_PATTERN.test(id)) return { status: 'error', error: `Invalid prompt id: ${id}` };
  const validationError = validateNameAndContent(name, content);
  if (validationError) return { status: 'error', error: validationError };
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const items = new PromptItemCollection();
    const existing = (await items.inScope(resolved.cwd)).find((item) => item.uuid === id);
    if (!existing) return { status: 'error', error: `Prompt not found: ${id}` };

    const updated = await items.update(existing.id, {
      name: name.trim(),
      content,
      updatedAt: Date.now(),
    });
    await replaceFiling(resolved.cwd, existing.id, parseCategoryIds(categories));

    const snapshot = await snapshotScope(resolved.cwd);
    return { status: 'ok', prompt: toWire(updated ?? existing, snapshot) };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/** Make [itemId] sit in exactly the categories named by [uuids], keeping the places it already has. */
async function replaceFiling(cwd: string | null, itemId: number, uuids: string[]): Promise<void> {
  const links = new PromptCategoryItemLinkCollection();
  const wanted = await existingCategoryIds(uuids);
  const current = await links.ofItem(itemId);

  const staleIds = new Set(
    current.filter((link) => !wanted.includes(link.categoryId)).map((link) => link.id),
  );
  if (staleIds.size > 0) {
    await links.mutate((rows) => ({
      rows: rows.filter((row) => !staleIds.has(row.id)),
      result: undefined,
    }));
  }
  const filed = new Set(current.map((link) => link.categoryId));
  for (const categoryId of wanted) {
    if (!filed.has(categoryId)) await fileOnTop(links, cwd, categoryId, itemId);
  }
}

/** Remove one prompt from a scope. Deleting an absent id is an error, not a no-op. */
export async function deletePrompt(
  scope: PromptScope,
  projectPath: string | undefined,
  id: string,
): Promise<PromptDeleteResult> {
  if (!VALID_ID_PATTERN.test(id)) return { status: 'error', error: `Invalid prompt id: ${id}` };
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const items = new PromptItemCollection();
    const existing = (await items.inScope(resolved.cwd)).find((item) => item.uuid === id);
    if (!existing) return { status: 'error', error: `Prompt not found: ${id}` };
    await removeItems(items, new Set([existing.id]));
    return { status: 'ok' };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/** Remove items and every link out of them. */
async function removeItems(items: PromptItemCollection, itemIds: Set<number>): Promise<void> {
  await items.mutate((rows) => ({
    rows: rows.filter((row) => !itemIds.has(row.id)),
    result: undefined,
  }));
  await new PromptCategoryItemLinkCollection().mutate((rows) => ({
    rows: rows.filter((row) => !itemIds.has(row.itemId)),
    result: undefined,
  }));
}

/**
 * Put the prompts of one scope in the order [orderedIds] gives, or the order
 * inside one category when [categoryId] is named.
 *
 * Ids the order does not mention keep their relative places after the named ones,
 * and ids that are not in the scope are ignored, so a stale drag from a screen
 * that has not seen a deletion cannot fail the whole move.
 */
export async function reorderPrompts(
  scope: PromptScope,
  projectPath: string | undefined,
  orderedIds: string[],
  categoryId?: string,
): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const items = new PromptItemCollection();
    const inScope = await items.inScope(resolved.cwd);
    const internalIdByUuid = new Map(inScope.map((item) => [item.uuid, item.id]));
    const named = orderedIds
      .map((uuid) => internalIdByUuid.get(uuid))
      .filter((id): id is number => id !== undefined);

    if (categoryId === undefined) {
      const rest = inScope.map((item) => item.id).filter((id) => !named.includes(id));
      const rank = new Map([...new Set([...named, ...rest])].map((id, index) => [id, index + 1]));
      await items.mutate((rows) => ({
        rows: rows.map((row) =>
          row.cwd === resolved.cwd && rank.has(row.id) ? { ...row, priority: rank.get(row.id) as number } : row,
        ),
        result: undefined,
      }));
      return { status: 'ok' };
    }

    const category = (await new PromptCategoryCollection().all()).find((c) => c.uuid === categoryId);
    if (!category) return { status: 'error', error: `Category not found: ${categoryId}` };

    const links = new PromptCategoryItemLinkCollection();
    const inCategory = (await links.inCategory(category.id)).filter((link) => link.belongsTo(resolved.cwd));
    const linkByItem = new Map(inCategory.map((link) => [link.itemId, link.id]));
    const namedLinks = named.map((itemId) => linkByItem.get(itemId)).filter((id): id is number => id !== undefined);
    const restLinks = inCategory.map((link) => link.id).filter((id) => !namedLinks.includes(id));
    const rank = new Map([...new Set([...namedLinks, ...restLinks])].map((id, index) => [id, index + 1]));
    await links.mutate((rows) => ({
      rows: rows.map((row) => (rank.has(row.id) ? { ...row, priority: rank.get(row.id) as number } : row)),
      result: undefined,
    }));
    return { status: 'ok' };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/**
 * Run a read-modify-write over one scope's prompts: read them in wire shape, let
 * [mutate] answer the list that should be stored (or a message to refuse), and
 * bring the entity files in line with that list.
 *
 * Exported so prompt-transfer.ts can fold an imported set in through the same
 * path every other write uses. The dependency runs one way: this module owns the
 * store and knows nothing about files being carried in or out.
 */
export async function mutatePromptStore(
  scope: PromptScope,
  projectPath: string | undefined,
  mutate: (prompts: SavedPrompt[]) => SavedPrompt[] | string,
  categoryOrder: () => Record<string, string[]> = () => ({}),
): Promise<{ status: 'ok' } | { status: 'error'; error: string }> {
  const resolved = resolveScopeCwd(scope, projectPath);
  if (resolved.status === 'error') return resolved;

  try {
    const snapshot = await snapshotScope(resolved.cwd);
    const current = snapshot.items.map((item) => toWire(item, snapshot));
    const next = mutate(current);
    if (typeof next === 'string') return { status: 'error', error: next };
    await bringInLine(resolved.cwd, snapshot, current, next, categoryOrder());
    return { status: 'ok' };
  } catch (err) {
    return failure('Failed to write prompts:', err);
  }
}

/**
 * Make the stored scope equal [next]: delete what is gone, edit what changed,
 * and add what is new on top in the order [next] lists it.
 *
 * Inside a category the new prompts also go on top. They keep the order
 * [categoryOrder] gives for that category (category id to prompt ids, top first),
 * and any the order does not mention follow in the order [next] lists them.
 */
async function bringInLine(
  cwd: string | null,
  snapshot: ScopeSnapshot,
  current: SavedPrompt[],
  next: SavedPrompt[],
  categoryOrder: Record<string, string[]> = {},
): Promise<void> {
  const items = new PromptItemCollection();
  const itemByUuid = new Map(snapshot.items.map((item) => [item.uuid, item]));
  const currentByUuid = new Map(current.map((prompt) => [prompt.id, prompt]));
  const nextIds = new Set(next.map((prompt) => prompt.id));

  const goneIds = new Set(
    snapshot.items.filter((item) => !nextIds.has(item.uuid)).map((item) => item.id),
  );
  if (goneIds.size > 0) await removeItems(items, goneIds);

  const added: SavedPrompt[] = [];
  for (const prompt of next) {
    const before = currentByUuid.get(prompt.id);
    const item = itemByUuid.get(prompt.id);
    if (!before || !item) {
      added.push(prompt);
      continue;
    }
    const sameFiling =
      JSON.stringify([...(before.categories ?? [])].sort()) ===
      JSON.stringify([...(prompt.categories ?? [])].sort());
    if (
      before.name !== prompt.name ||
      before.content !== prompt.content ||
      before.createdAt !== prompt.createdAt ||
      before.updatedAt !== prompt.updatedAt
    ) {
      await items.update(item.id, {
        name: prompt.name,
        content: prompt.content,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      });
    }
    if (!sameFiling) await replaceFiling(cwd, item.id, prompt.categories ?? []);
  }

  if (added.length === 0) return;

  // Room for all of them at once, then each takes the place its position in the
  // incoming list gives it, so the file's order survives the import.
  await makeRoomAtTop(items, cwd, added.length);
  const createdIdByUuid = new Map<string, number>();
  for (const [index, prompt] of added.entries()) {
    const item = await items.create({
      cwd,
      priority: index + 1,
      uuid: prompt.id,
      name: prompt.name,
      content: prompt.content,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    });
    createdIdByUuid.set(prompt.id, item.id);
  }

  // Each category the new prompts are filed under gets them all at once, on top
  // of what it already holds, in one block.
  const links = new PromptCategoryItemLinkCollection();
  const members = new Map<string, string[]>();
  for (const prompt of added) {
    for (const categoryUuid of prompt.categories ?? []) {
      members.set(categoryUuid, [...(members.get(categoryUuid) ?? []), prompt.id]);
    }
  }
  for (const [categoryUuid, promptIds] of members) {
    const [categoryId] = await existingCategoryIds([categoryUuid]);
    if (categoryId === undefined) continue;

    const wanted = categoryOrder[categoryUuid] ?? [];
    const rank = (id: string) => {
      const place = wanted.indexOf(id);
      return place === -1 ? Number.MAX_SAFE_INTEGER : place;
    };
    // A stable sort: those the order does not mention keep their incoming order.
    const ordered = [...promptIds].sort((a, b) => rank(a) - rank(b));

    await links.mutate((rows) => ({
      rows: rows.map((row) =>
        row.cwd === cwd && row.categoryId === categoryId
          ? { ...row, priority: row.priority + ordered.length }
          : row,
      ),
      result: undefined,
    }));
    await links.createMissing(
      ordered.map((id, index) => ({
        cwd,
        categoryId,
        itemId: createdIdByUuid.get(id) as number,
        priority: index + 1,
      })),
      (stored, candidate) => stored.categoryId === candidate.categoryId && stored.itemId === candidate.itemId,
    );
  }
}

function failure(label: string, err: unknown): { status: 'error'; error: string } {
  const error = err instanceof Error ? err.message : String(err);
  console.error('[node-backend]', label, err);
  return { status: 'error', error };
}
