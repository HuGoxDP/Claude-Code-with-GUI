import { useState } from 'react';
import { move } from '@dnd-kit/helpers';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import {
  allRowIndex,
  applyCategoryOrder,
  categoryIdsOfSortable,
  categorySortableId,
  columnIds,
  isCategorySortableId,
} from '@/utils/promptOrder';
import { updateCategoryOrder, useCategoryOrder } from '@/utils/promptOrderStore';
import { moveCategoryBy } from '@/utils/promptReorderCommands';
import type { PromptCategory } from '@/types/prompt';

export interface CategoryReorder {
  /** The categories to draw, in the order to draw them: arranged, then previewed. */
  categories: PromptCategory[];
  /** How many of those categories sit above the "All" row, which is part of the column. */
  allIndex: number;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  /** Move one category a step up or down the column. False at either end. */
  moveBy: (rowId: string, delta: -1 | 1) => boolean;
}

/**
 * Which order the category column is in, and how a drag changes it.
 *
 * The same shape as {@link usePromptReorder}, for the same reasons: the drag in
 * flight is previewed so neighbours slide aside, nothing is kept until the drop
 * lands, and the arranged order lives in the shared store so the library modal
 * and the `!!` panel show one column.
 *
 * Only a drag of a category row is this hook's business. The drag layer reports
 * every drag in the provider to every handler, and a prompt being carried across
 * the column must not be read as a category being moved.
 */
export function useCategoryReorder(categories: PromptCategory[]): CategoryReorder {
  const order = useCategoryOrder();
  const [preview, setPreview] = useState<string[] | null>(null);

  const arranged = applyCategoryOrder(categories, order);
  // "All" is a row of the column like any other, so it is sorted with them.
  const arrangedSortableIds = columnIds(categories, order).map(categorySortableId);

  const previewIds = preview === null ? null : categoryIdsOfSortable(preview);
  const shown = previewIds === null ? arranged : applyCategoryOrder(arranged, previewIds);
  const allIndex = allRowIndex(previewIds ?? order, shown);

  const onDragOver = (event: DragOverEvent) => {
    if (!isCategorySortableId(event.operation.source?.id)) return;
    setPreview((current) => move(current ?? arrangedSortableIds, event));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!isCategorySortableId(event.operation.source?.id)) return;
    const finished = preview;
    setPreview(null);
    if (event.canceled || finished === null) return;

    updateCategoryOrder(() => categoryIdsOfSortable(finished));
  };

  const moveBy = (rowId: string, delta: -1 | 1) => moveCategoryBy(categories, rowId, delta);

  return { categories: shown, allIndex, onDragOver, onDragEnd, moveBy };
}
