import { useState } from 'react';
import { move } from '@dnd-kit/helpers';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import {
  applyCategoryOrder,
  categoryIdsOfSortable,
  categorySortableId,
  isCategorySortableId,
} from '@/utils/promptOrder';
import { updateCategoryOrder, useCategoryOrder } from '@/utils/promptOrderStore';
import type { PromptCategory } from '@/types/prompt';

export interface CategoryReorder {
  /** The categories to draw, in the order to draw them: arranged, then previewed. */
  categories: PromptCategory[];
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
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
  const arrangedSortableIds = arranged.map((category) => categorySortableId(category.id));

  const shown =
    preview === null
      ? arranged
      : applyCategoryOrder(arranged, categoryIdsOfSortable(preview));

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

  return { categories: shown, onDragOver, onDragEnd };
}
