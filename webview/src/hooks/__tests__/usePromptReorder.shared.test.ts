import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { usePromptReorder } from '../usePromptReorder';
import { promptSortableId } from '@/utils/promptOrder';
import { resetPromptOrder } from '@/utils/promptOrderStore';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({
  id,
  name: id,
  content: `${id} body`,
  createdAt: 1,
  updatedAt: 1,
});

const sources = (ids: string[]) => ({ global: ids.map(prompt), project: [] });
const all = () => true;
const idsOf = (prompts: SavedPrompt[]) => prompts.map((p) => p.id);

/** The part of a drag event the hook and dnd-kit's `move` read. */
function dragEvent(source: string, target: string) {
  return {
    canceled: false,
    operation: {
      canceled: false,
      source: {
        id: promptSortableId('global', source),
        manager: { dragOperation: { shape: null, position: { current: { x: 0, y: 0 } } } },
      },
      target: { id: promptSortableId('global', target), data: undefined },
    },
  } as unknown as DragOverEvent & DragEndEvent;
}

/**
 * The library modal and the `!!` panel both use this hook, and an order made on
 * one has to be the order on the other. Two readers stand for the two screens.
 */
describe('usePromptReorder shared between two screens', () => {
  beforeEach(() => {
    resetPromptOrder();
  });

  it('shows on the other screen the order dragged on this one', () => {
    const modal = renderHook(() => usePromptReorder(sources(['a', 'b', 'c']), all));
    const panel = renderHook(() => usePromptReorder(sources(['a', 'b', 'c']), all));

    act(() => modal.result.current.onDragOver(dragEvent('a', 'c')));
    act(() => modal.result.current.onDragEnd(dragEvent('a', 'c')));

    expect(idsOf(modal.result.current.lists.global)).toEqual(['b', 'c', 'a']);
    expect(idsOf(panel.result.current.lists.global)).toEqual(['b', 'c', 'a']);
  });

  // The drag in flight is one screen's own preview. The other screen must not
  // show a half-made move that may still be cancelled.
  it('does not show the other screen a drag that has not landed', () => {
    const modal = renderHook(() => usePromptReorder(sources(['a', 'b', 'c']), all));
    const panel = renderHook(() => usePromptReorder(sources(['a', 'b', 'c']), all));

    act(() => modal.result.current.onDragOver(dragEvent('a', 'c')));

    expect(idsOf(modal.result.current.lists.global)).toEqual(['b', 'c', 'a']);
    expect(idsOf(panel.result.current.lists.global)).toEqual(['a', 'b', 'c']);
  });
});
