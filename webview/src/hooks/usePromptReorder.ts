import { useState } from 'react';
import { move } from '@dnd-kit/helpers';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { readCategoryDrop } from '@/utils/promptDrag';
import {
  emptyPromptOrder,
  isPromptSortableId,
  layeredPromptOrder,
  mergeVisibleOrder,
  promptIdsOfSortable,
  promptSortableId,
  type OrderView,
} from '@/utils/promptOrder';
import {
  getPromptOrder,
  updatePromptOrder,
  updatePromptOrderByCategory,
  usePromptOrder,
  usePromptOrderByCategory,
} from '@/utils/promptOrderStore';
import type { PromptScope, SavedPrompt } from '@/types/prompt';

type PromptLists<P extends SavedPrompt> = Record<PromptScope, P[]>;
type SortableIds = Record<PromptScope, string[]>;

const ALL_VIEW: OrderView = { kind: 'all' };
const everything = () => true;

export interface PromptReorderOptions<P extends SavedPrompt> {
  /** What is on screen: the category and the search. Defaults to everything. */
  isShown?: (prompt: P) => boolean;
  /** What belongs to the view being shown, ignoring the search. Defaults to everything. */
  isMember?: (prompt: P) => boolean;
  /** Which order is being shown and may be changed. Defaults to the whole library. */
  view?: OrderView;
}

export interface PromptReorder<P extends SavedPrompt> {
  /** The cards to draw, in the order to draw them: arranged, narrowed, previewed. */
  lists: PromptLists<P>;
  /** False in a view that has no order of its own, where a card can be filed but not moved. */
  sortable: boolean;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

/**
 * Which order the prompt cards are in, and how a drag changes it.
 *
 * Used by the library modal and by the `!!` panel. The arranged orders are
 * shared between them through the order store, so a drag on either screen is the
 * order on both. The drag in flight is not shared: it is this screen's preview
 * alone.
 *
 * Which order a drag changes depends on the view. In "all" it is the library's
 * own. Inside a category it is that category's, and the library's is left alone,
 * because the same prompt can sit in different places in different categories.
 * In "uncategorised" there is no order of its own, so a drag changes nothing.
 *
 * [sources] is every prompt, so that an order always covers the whole set it
 * belongs to. [isShown] is what the category and the search leave on screen, and
 * [isMember] what belongs to the category whatever the search says. What the user
 * drags is only the part still on screen, so a drop is folded back into the full
 * order rather than replacing it.
 *
 * The preview follows the pattern the dock editor uses: the drag layer reports
 * each step as it happens, the steps are previewed so neighbours slide aside,
 * and nothing is kept until the drop lands. A cancelled drag therefore needs no
 * undo, because the arranged order was never touched.
 */
export function usePromptReorder<P extends SavedPrompt>(
  sources: PromptLists<P>,
  options: PromptReorderOptions<P> = {},
): PromptReorder<P> {
  const { isShown = everything, isMember = everything, view = ALL_VIEW } = options;
  const allOrder = usePromptOrder();
  const orderByCategory = usePromptOrderByCategory();
  const [preview, setPreview] = useState<SortableIds | null>(null);

  const sortable = view.kind !== 'uncategorised';
  const categoryOrder = view.kind === 'category' ? orderByCategory[view.id] : undefined;

  const arrange = (scope: PromptScope): P[] =>
    layeredPromptOrder(sources[scope], allOrder[scope], categoryOrder?.[scope]);
  const shown: PromptLists<P> = {
    global: arrange('global').filter(isShown),
    project: arrange('project').filter(isShown),
  };
  const shownSortableIds: SortableIds = {
    global: shown.global.map((prompt) => promptSortableId('global', prompt.id)),
    project: shown.project.map((prompt) => promptSortableId('project', prompt.id)),
  };

  const previewed = (scope: PromptScope): P[] =>
    preview === null
      ? shown[scope]
      : layeredPromptOrder(shown[scope], promptIdsOfSortable(scope, preview[scope]), undefined);

  // The drag layer reports every drag in the provider to every handler, so a
  // category row being moved must not be read as a prompt card being moved.
  const onDragOver = (event: DragOverEvent) => {
    if (!sortable || !isPromptSortableId(event.operation.source?.id)) return;
    setPreview((current) => move(current ?? shownSortableIds, event));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!sortable || !isPromptSortableId(event.operation.source?.id)) return;
    const finished = preview;
    setPreview(null);
    if (event.canceled || finished === null) return;
    // Dropped on a category: that is filing, not reordering, and the card goes
    // back where it was. The category drop is handled by the caller.
    if (readCategoryDrop(event.operation.target?.data) !== null) return;

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
          next[scope] = mergeVisibleOrder(memberIds, promptIdsOfSortable(scope, finished[scope]));
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
        next[scope] = mergeVisibleOrder(fullIds, promptIdsOfSortable(scope, finished[scope]));
      }
      return next;
    });
  };

  return {
    lists: { global: previewed('global'), project: previewed('project') },
    sortable,
    onDragOver,
    onDragEnd,
  };
}
