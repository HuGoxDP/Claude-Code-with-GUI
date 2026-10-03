import { useState } from 'react';
import { move } from '@dnd-kit/helpers';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { readCategoryDrop } from '@/utils/promptDrag';
import {
  applyPromptOrder,
  emptyPromptOrder,
  isPromptSortableId,
  mergeVisibleOrder,
  promptIdsOfSortable,
  promptSortableId,
} from '@/utils/promptOrder';
import { updatePromptOrder, usePromptOrder } from '@/utils/promptOrderStore';
import type { PromptScope, SavedPrompt } from '@/types/prompt';

type PromptLists<P extends SavedPrompt> = Record<PromptScope, P[]>;
type SortableIds = Record<PromptScope, string[]>;

export interface PromptReorder<P extends SavedPrompt> {
  /** The cards to draw, in the order to draw them: arranged, narrowed, previewed. */
  lists: PromptLists<P>;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

/**
 * Which order the prompt cards are in, and how a drag changes it.
 *
 * Used by the library modal and by the `!!` panel. The arranged order is shared
 * between them through the order store, so a drag on either screen is the order
 * on both. The drag in flight is not shared: it is this screen's preview alone.
 *
 * [isShown] is the search and category narrowing. The arranged order covers
 * every prompt, and what the user drags is only the part of it still on screen,
 * so a drop is folded back into the full order rather than replacing it.
 *
 * The preview follows the pattern the dock editor uses: the drag layer reports
 * each step as it happens, the steps are previewed so neighbours slide aside,
 * and nothing is kept until the drop lands. A cancelled drag therefore needs no
 * undo, because the arranged order was never touched.
 */
export function usePromptReorder<P extends SavedPrompt>(
  sources: PromptLists<P>,
  isShown: (prompt: P) => boolean,
): PromptReorder<P> {
  const order = usePromptOrder();
  const [preview, setPreview] = useState<SortableIds | null>(null);

  const arranged: PromptLists<P> = {
    global: applyPromptOrder(sources.global, order.global),
    project: applyPromptOrder(sources.project, order.project),
  };
  const shown: PromptLists<P> = {
    global: arranged.global.filter(isShown),
    project: arranged.project.filter(isShown),
  };
  const shownSortableIds: SortableIds = {
    global: shown.global.map((prompt) => promptSortableId('global', prompt.id)),
    project: shown.project.map((prompt) => promptSortableId('project', prompt.id)),
  };

  const previewed = (scope: PromptScope): P[] =>
    preview === null
      ? shown[scope]
      : applyPromptOrder(shown[scope], promptIdsOfSortable(scope, preview[scope]));

  // The drag layer reports every drag in the provider to every handler, so a
  // category row being moved must not be read as a prompt card being moved.
  const onDragOver = (event: DragOverEvent) => {
    if (!isPromptSortableId(event.operation.source?.id)) return;
    setPreview((current) => move(current ?? shownSortableIds, event));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!isPromptSortableId(event.operation.source?.id)) return;
    const finished = preview;
    setPreview(null);
    if (event.canceled || finished === null) return;
    // Dropped on a category: that is filing, not reordering, and the card goes
    // back where it was. The category drop is handled by the caller.
    if (readCategoryDrop(event.operation.target?.data) !== null) return;

    updatePromptOrder((current) => {
      const next = emptyPromptOrder();
      for (const scope of ['global', 'project'] as const) {
        const fullIds = applyPromptOrder(sources[scope], current[scope]).map((prompt) => prompt.id);
        next[scope] = mergeVisibleOrder(fullIds, promptIdsOfSortable(scope, finished[scope]));
      }
      return next;
    });
  };

  return {
    lists: { global: previewed('global'), project: previewed('project') },
    onDragOver,
    onDragEnd,
  };
}
