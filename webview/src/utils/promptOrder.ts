import type { PromptScope, SavedPrompt } from '@/types/prompt';
import { ALL_CATEGORIES, UNCATEGORISED, type CategorySelection } from './promptCategories';

/**
 * Which of the library's orders a screen is showing, and so which one a drag
 * there may change.
 *
 * "All" is not a category but the whole library, and its order is the library's
 * own. A real category has an order of its own on top of that, so the same prompt
 * can sit in different places in different categories. "Uncategorised" has none:
 * it is whatever is left over, listed in the all-order, and there is nothing of
 * its own to rearrange.
 */
export type OrderView =
  | { kind: 'all' }
  | { kind: 'category'; id: string }
  | { kind: 'uncategorised' };

export function orderViewOf(selection: CategorySelection): OrderView {
  if (selection === ALL_CATEGORIES) return { kind: 'all' };
  if (selection === UNCATEGORISED) return { kind: 'uncategorised' };
  return { kind: 'category', id: selection };
}

/**
 * Putting the prompt cards in the order the user dragged them to.
 *
 * The rules live here as pure functions rather than in the modal, for the same
 * reason `promptDrag.ts` does: they are the part that decides what a drag MEANS,
 * and that has to be checkable without a pointer, a layout or a drag library.
 */

/** The order the user left each section in, as prompt ids. */
export type PromptOrder = Record<PromptScope, string[]>;

export function emptyPromptOrder(): PromptOrder {
  return { global: [], project: [] };
}

const SORTABLE_ID_PREFIX = 'prompt-drag';

/**
 * The id a card registers with the drag layer.
 *
 * The scope is part of it because the two sections are separate stores and a
 * prompt id is only promised to be unique inside one of them.
 */
export function promptSortableId(scope: PromptScope, promptId: string): string {
  return `${SORTABLE_ID_PREFIX}:${scope}:${promptId}`;
}

/** Whether a drag layer id is a prompt card's, as opposed to a category row's. */
export function isPromptSortableId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(`${SORTABLE_ID_PREFIX}:`);
}

const CATEGORY_SORTABLE_ID_PREFIX = 'category-sort';

/** The id a category row registers with the drag layer for being reordered. */
export function categorySortableId(categoryId: string): string {
  return `${CATEGORY_SORTABLE_ID_PREFIX}:${categoryId}`;
}

/** Whether a drag layer id is a category row's, as opposed to a prompt card's. */
export function isCategorySortableId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(`${CATEGORY_SORTABLE_ID_PREFIX}:`);
}

/** Take the category ids back out of the column's sortable ids. */
export function categoryIdsOfSortable(sortableIds: string[]): string[] {
  const prefix = `${CATEGORY_SORTABLE_ID_PREFIX}:`;
  return sortableIds
    .filter((sortableId) => sortableId.startsWith(prefix))
    .map((sortableId) => sortableId.slice(prefix.length));
}

/**
 * [categories] in the order [ids] gives, with any [ids] has never heard of
 * placed LAST.
 *
 * Last, unlike prompts, because the column has always grown downwards: a
 * category made later has always been the bottom row, and a drag that rearranged
 * the others should not start putting new ones at the top. A column nobody has
 * arranged has no ids, so every category is unknown and keeps its natural order.
 */
export function applyCategoryOrder<C extends { id: string }>(categories: C[], ids: string[]): C[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const known = categories
    .filter((category) => rank.has(category.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const unknown = categories.filter((category) => !rank.has(category.id));
  return [...known, ...unknown];
}

/** Take the prompt ids back out of a section's sortable ids, dropping foreign ones. */
export function promptIdsOfSortable(scope: PromptScope, sortableIds: string[]): string[] {
  const prefix = `${SORTABLE_ID_PREFIX}:${scope}:`;
  return sortableIds
    .filter((sortableId) => sortableId.startsWith(prefix))
    .map((sortableId) => sortableId.slice(prefix.length));
}

/**
 * [prompts] in the order [ids] gives, with anything [ids] has never heard of
 * placed first.
 *
 * First, because a prompt the order does not know is one that arrived after the
 * user last arranged the list, and a new prompt belongs at the top the way it
 * does everywhere else in the library. An id with no prompt behind it is simply
 * ignored, which is what makes a deleted prompt harmless.
 */
export function applyPromptOrder<P extends SavedPrompt>(prompts: P[], ids: string[]): P[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const unknown = prompts.filter((prompt) => !rank.has(prompt.id));
  const known = prompts
    .filter((prompt) => rank.has(prompt.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...unknown, ...known];
}

/**
 * [prompts] in the order a view shows them: the all-order first, then, inside a
 * category, that category's own order on top of it.
 *
 * Layered rather than replaced. A category nobody has arranged has no order of
 * its own, and then it is simply the all-order narrowed. A prompt filed into it
 * later is one its order has not heard of, and so lands on top, the same as any
 * new prompt.
 */
export function layeredPromptOrder<P extends SavedPrompt>(
  prompts: P[],
  allIds: string[],
  categoryIds: string[] | undefined,
): P[] {
  const byAll = applyPromptOrder(prompts, allIds);
  return categoryIds === undefined ? byAll : applyPromptOrder(byAll, categoryIds);
}

/**
 * The `!!` panel's single list: project prompts first, then global ones, each
 * scope in the order the user arranged it.
 *
 * Project first because a project-specific phrase is the more specific answer,
 * which is the order the panel has always had. Each scope is arranged on its own
 * because the two are separate stores with no order to share. [categoryOrder] is
 * the order of the category being viewed, when one is.
 */
export function arrangeByScope<P extends SavedPrompt & { scope: PromptScope }>(
  prompts: P[],
  order: PromptOrder,
  categoryOrder?: PromptOrder,
): P[] {
  const inScope = (scope: PromptScope) => prompts.filter((prompt) => prompt.scope === scope);
  return [
    ...layeredPromptOrder(inScope('project'), order.project, categoryOrder?.project),
    ...layeredPromptOrder(inScope('global'), order.global, categoryOrder?.global),
  ];
}

/**
 * Fold the order of the cards that are ON SCREEN back into the full list.
 *
 * A search or a category hides some prompts, and the user can still drag the
 * ones they see. The cards left out must not move, and must not jump over the
 * ones that did: the shown cards are re-sequenced among themselves, each into a
 * slot a shown card already held, so every hidden card keeps its place.
 */
export function mergeVisibleOrder(fullIds: string[], reorderedVisibleIds: string[]): string[] {
  const shown = new Set(reorderedVisibleIds);
  let next = 0;
  return fullIds.map((id) => {
    if (!shown.has(id)) return id;
    const replacement = reorderedVisibleIds[next];
    next += 1;
    return replacement ?? id;
  });
}
