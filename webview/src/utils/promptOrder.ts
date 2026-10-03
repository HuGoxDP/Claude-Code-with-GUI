import type { PromptScope, SavedPrompt } from '@/types/prompt';

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

/** Whether a drag layer id is a prompt card's. */
export function isPromptSortableId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(`${SORTABLE_ID_PREFIX}:`);
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
 * The `!!` panel's single list: project prompts first, then global ones, each
 * scope in the order the user arranged it.
 *
 * Project first because a project-specific phrase is the more specific answer,
 * which is the order the panel has always had. Each scope is arranged on its own
 * because the two are separate stores with no order to share.
 */
export function arrangeByScope<P extends SavedPrompt & { scope: PromptScope }>(
  prompts: P[],
  order: PromptOrder,
): P[] {
  const inScope = (scope: PromptScope) => prompts.filter((prompt) => prompt.scope === scope);
  return [
    ...applyPromptOrder(inScope('project'), order.project),
    ...applyPromptOrder(inScope('global'), order.global),
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
