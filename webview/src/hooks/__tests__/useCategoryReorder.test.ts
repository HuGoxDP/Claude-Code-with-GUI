import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { useCategoryReorder } from '../useCategoryReorder';
import { categorySortableId, promptSortableId } from '@/utils/promptOrder';
import { resetPromptOrder, updateCategoryOrder } from '@/utils/promptOrderStore';
import type { PromptCategory } from '@/types/prompt';

const category = (id: string): PromptCategory => ({ id, name: id, createdAt: 1 });
const categories = (ids: string[]) => ids.map(category);
const idsOf = (list: PromptCategory[]) => list.map((c) => c.id);

/** The part of a drag event the hook and dnd-kit's `move` read. */
function dragEvent(options: {
  sourceId: string;
  targetId: string | null;
  canceled?: boolean;
  /** The positions the drag layer reports for a sortable item, when it has them. */
  sortable?: { initialIndex: number; index: number };
}) {
  const canceled = options.canceled ?? false;
  return {
    canceled,
    operation: {
      canceled,
      source: {
        id: options.sourceId,
        ...options.sortable,
        manager: { dragOperation: { shape: null, position: { current: { x: 0, y: 0 } } } },
      },
      target: options.targetId === null ? null : { id: options.targetId, data: undefined },
    },
  } as unknown as DragOverEvent & DragEndEvent;
}

const sort = (source: string, target: string | null, canceled = false) =>
  dragEvent({
    sourceId: categorySortableId(source),
    targetId: target === null ? null : categorySortableId(target),
    canceled,
  });

describe('useCategoryReorder', () => {
  // The arranged order is shared between screens and outlives a render.
  beforeEach(() => {
    resetPromptOrder();
  });

  it('keeps the natural order until the user arranges the column', () => {
    const { result } = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));

    expect(idsOf(result.current.categories)).toEqual(['a', 'b', 'c']);
  });

  it('previews the move while a row is still held', () => {
    const { result } = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(sort('a', 'c')));

    expect(idsOf(result.current.categories)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the new order after the drop', () => {
    const { result } = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(sort('a', 'c')));
    act(() => result.current.onDragEnd(sort('a', 'c')));

    expect(idsOf(result.current.categories)).toEqual(['b', 'c', 'a']);
  });

  it('goes back to the original order when the drag is cancelled', () => {
    const { result } = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(sort('a', 'c')));
    act(() => result.current.onDragEnd(sort('a', 'c', true)));

    expect(idsOf(result.current.categories)).toEqual(['a', 'b', 'c']);
  });

  // The drag layer reports every drag in the provider to every handler. A prompt
  // card carried over the column is not a category being moved.
  it('ignores a prompt card being dragged', () => {
    const { result } = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));
    // Carries sortable positions that WOULD move a category if they were read, so
    // that the test cannot pass merely because nothing could be found.
    const card = (source: string, target: string) =>
      dragEvent({
        sourceId: promptSortableId('global', source),
        targetId: categorySortableId(target),
        sortable: { initialIndex: 0, index: 2 },
      });

    act(() => result.current.onDragOver(card('p1', 'c')));
    act(() => result.current.onDragEnd(card('p1', 'c')));

    expect(idsOf(result.current.categories)).toEqual(['a', 'b', 'c']);
  });

  // The column has always grown downwards, so a category made after the user
  // arranged it goes to the bottom rather than the top.
  it('puts a category made after the arrangement at the bottom', () => {
    act(() => {
      updateCategoryOrder(() => ['c', 'a', 'b']);
    });

    const { result } = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c', 'new'])));

    expect(idsOf(result.current.categories)).toEqual(['c', 'a', 'b', 'new']);
  });

  it('shows the order another screen arranged', () => {
    const modal = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));
    const panel = renderHook(() => useCategoryReorder(categories(['a', 'b', 'c'])));

    act(() => modal.result.current.onDragOver(sort('a', 'c')));
    act(() => modal.result.current.onDragEnd(sort('a', 'c')));

    expect(idsOf(panel.result.current.categories)).toEqual(['b', 'c', 'a']);
  });
});
