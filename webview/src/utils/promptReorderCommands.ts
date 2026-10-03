import { arrayMove } from '@dnd-kit/helpers';
import {
  columnIds,
  emptyPromptOrder,
  layeredPromptOrder,
  mergeVisibleOrder,
  type OrderView,
} from './promptOrder';
import {
  getCategoryOrder,
  getPromptOrder,
  updateCategoryOrder,
  updatePromptOrder,
  updatePromptOrderByCategory,
} from './promptOrderStore';
import type { PromptCategory, PromptScope, SavedPrompt } from '@/types/prompt';

/**
 * The two ways the order changes, written once so that a drag and a key press
 * cannot disagree about what a move means.
 *
 * They are plain functions over the order store rather than part of a hook,
 * because the `!!` panel handles its keys outside the component that draws the
 * rows, and has to be able to make the same move without owning that component.
 */

type Lists<P extends SavedPrompt> = Record<PromptScope, P[]>;
type Ids = Record<PromptScope, string[]>;

export interface CommitOptions<P extends SavedPrompt> {
  view: OrderView;
  /** Every prompt, so that an order always covers the whole set it belongs to. */
  sources: Lists<P>;
  /** What belongs to the view, whatever the search says. */
  isMember: (prompt: P) => boolean;
  /** The ids of the cards on screen, in the order they now have. */
  visibleIds: Ids;
}

/**
 * Keep the order of the cards that are on screen.
 *
 * What is on screen may be only part of the set (a search hides some), so it is
 * folded back into the full order rather than replacing it: the cards left out
 * keep their places. In "uncategorised" there is no order of its own, so nothing
 * is kept.
 */
export function commitPromptOrder<P extends SavedPrompt>(options: CommitOptions<P>): void {
  const { view, sources, isMember, visibleIds } = options;
  if (view.kind === 'uncategorised') return;

  if (view.kind === 'category') {
    updatePromptOrderByCategory((current) => {
      const next = emptyPromptOrder();
      for (const scope of ['global', 'project'] as const) {
        // Only the category's own prompts: an order that listed every prompt in
        // the library would give a prompt filed here later a stale place instead
        // of the top.
        const memberIds = layeredPromptOrder(
          sources[scope].filter(isMember),
          getPromptOrder()[scope],
          current[view.id]?.[scope],
        ).map((prompt) => prompt.id);
        next[scope] = mergeVisibleOrder(memberIds, visibleIds[scope]);
      }
      return { ...current, [view.id]: next };
    });
    return;
  }

  updatePromptOrder((current) => {
    const next = emptyPromptOrder();
    for (const scope of ['global', 'project'] as const) {
      const fullIds = layeredPromptOrder(sources[scope], current[scope], undefined).map(
        (prompt) => prompt.id,
      );
      next[scope] = mergeVisibleOrder(fullIds, visibleIds[scope]);
    }
    return next;
  });
}

export interface MovePromptOptions<P extends SavedPrompt> {
  view: OrderView;
  sources: Lists<P>;
  isMember: (prompt: P) => boolean;
  /** The ids of the cards on screen as they are now, in the order they are drawn. */
  shownIds: Ids;
  scope: PromptScope;
  promptId: string;
  delta: -1 | 1;
}

/**
 * Move one card a step up or down among the cards on screen. Answers whether it
 * moved, which is false at either end of its list and in a view with no order.
 */
export function movePromptBy<P extends SavedPrompt>(options: MovePromptOptions<P>): boolean {
  const { view, sources, isMember, shownIds, scope, promptId, delta } = options;
  if (view.kind === 'uncategorised') return false;

  const ids = shownIds[scope];
  const from = ids.indexOf(promptId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return false;

  commitPromptOrder({
    view,
    sources,
    isMember,
    visibleIds: { ...shownIds, [scope]: arrayMove(ids, from, to) },
  });
  return true;
}

/**
 * Move one row of the category column a step up or down. Answers whether it
 * moved, which is false at either end. The row may be "All" (passed as its
 * sentinel id), which sorts with the categories; "uncategorised" is fixed at the
 * bottom and never passed here.
 */
export function moveCategoryBy(
  categories: PromptCategory[],
  categoryId: string,
  delta: -1 | 1,
): boolean {
  const ids = columnIds(categories, getCategoryOrder());
  const from = ids.indexOf(categoryId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return false;

  updateCategoryOrder(() => arrayMove(ids, from, to));
  return true;
}
