import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { usePromptReorder } from '../usePromptReorder';
import { promptSortableId } from '@/utils/promptOrder';
import { resetPromptOrder } from '@/utils/promptOrderStore';
import type { PromptScope, SavedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({
  id,
  name: id,
  content: `${id} body`,
  createdAt: 1,
  updatedAt: 1,
});

const sourcesOf = (global: string[], project: string[] = []) => ({
  global: global.map(prompt),
  project: project.map(prompt),
});

const all = () => true;

/**
 * The part of a drag event this hook and dnd-kit's `move` actually read.
 *
 * `move` bails out when the dragged item has no `manager`, so a bare id is not
 * enough for it to do its work; the manager's shape is what it falls back on to
 * tell which side of a target the pointer is on.
 */
function dragEvent(options: {
  scope?: PromptScope;
  source: string;
  target: string | null;
  targetData?: Record<string, unknown>;
  canceled?: boolean;
}) {
  const scope = options.scope ?? 'global';
  const canceled = options.canceled ?? false;
  return {
    canceled,
    operation: {
      canceled,
      source: {
        id: promptSortableId(scope, options.source),
        manager: { dragOperation: { shape: null, position: { current: { x: 0, y: 0 } } } },
      },
      target:
        options.target === null
          ? null
          : {
              id: options.target.startsWith('category-drop:')
                ? options.target
                : promptSortableId(scope, options.target),
              data: options.targetData,
            },
    },
  } as unknown as DragOverEvent & DragEndEvent;
}

const idsOf = (prompts: SavedPrompt[]) => prompts.map((p) => p.id);

describe('usePromptReorder', () => {
  // The arranged order is shared between screens and lives outside any one
  // component, so a test would otherwise start from the previous test's drag.
  beforeEach(() => {
    resetPromptOrder();
  });

  it('shows the cards in the order they came before anything is dragged', () => {
    const { result } = renderHook(() => usePromptReorder(sourcesOf(['a', 'b', 'c'])));

    expect(idsOf(result.current.lists.global)).toEqual(['a', 'b', 'c']);
  });

  // The neighbours have to slide aside while the card is still being held, so
  // the order is previewed on every step rather than only at the drop.
  it('previews the order while a card is still held', () => {
    const { result } = renderHook(() => usePromptReorder(sourcesOf(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(dragEvent({ source: 'a', target: 'c' })));

    expect(idsOf(result.current.lists.global)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the new order after the drop', () => {
    const { result } = renderHook(() => usePromptReorder(sourcesOf(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(dragEvent({ source: 'a', target: 'c' })));
    act(() => result.current.onDragEnd(dragEvent({ source: 'a', target: 'c' })));

    expect(idsOf(result.current.lists.global)).toEqual(['b', 'c', 'a']);
  });

  // Escape or a lost pointer. The arranged order was never touched, so going
  // back needs no undo, which only holds while the preview stays separate.
  it('goes back to the original order when the drag is cancelled', () => {
    const { result } = renderHook(() => usePromptReorder(sourcesOf(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(dragEvent({ source: 'a', target: 'c' })));
    act(() => result.current.onDragEnd(dragEvent({ source: 'a', target: 'c', canceled: true })));

    expect(idsOf(result.current.lists.global)).toEqual(['a', 'b', 'c']);
  });

  // Dropping on a category files the prompt. It must not also leave the card
  // wherever the pointer happened to pass over its neighbours on the way there.
  it('does not reorder when the card is dropped on a category', () => {
    const { result } = renderHook(() => usePromptReorder(sourcesOf(['a', 'b', 'c'])));

    act(() => result.current.onDragOver(dragEvent({ source: 'a', target: 'c' })));
    act(() =>
      result.current.onDragEnd(
        dragEvent({ source: 'a', target: 'category-drop:c1', targetData: { key: 'c1' } }),
      ),
    );

    expect(idsOf(result.current.lists.global)).toEqual(['a', 'b', 'c']);
  });

  it('reorders one section without touching the other', () => {
    const { result } = renderHook(() =>
      usePromptReorder(sourcesOf(['a', 'b'], ['x', 'y'])),
    );

    act(() =>
      result.current.onDragOver(dragEvent({ scope: 'project', source: 'x', target: 'y' })),
    );
    act(() =>
      result.current.onDragEnd(dragEvent({ scope: 'project', source: 'x', target: 'y' })),
    );

    expect(idsOf(result.current.lists.project)).toEqual(['y', 'x']);
    expect(idsOf(result.current.lists.global)).toEqual(['a', 'b']);
  });

  // The user drags among what a search left on screen. The card the search hid
  // must stay where it was in the full list, not jump or vanish.
  it('keeps a hidden card in place when the visible ones are reordered', () => {
    const sources = sourcesOf(['a', 'b', 'c', 'd']);
    const { result, rerender } = renderHook(
      ({ isShown }: { isShown: (p: SavedPrompt) => boolean }) =>
        usePromptReorder(sources, { isShown }),
      { initialProps: { isShown: (p: SavedPrompt) => p.id !== 'b' } },
    );

    act(() => result.current.onDragOver(dragEvent({ source: 'a', target: 'd' })));
    act(() => result.current.onDragEnd(dragEvent({ source: 'a', target: 'd' })));
    expect(idsOf(result.current.lists.global)).toEqual(['c', 'd', 'a']);

    // Search cleared: the hidden card is back, exactly where it was.
    rerender({ isShown: all });
    expect(idsOf(result.current.lists.global)).toEqual(['c', 'b', 'd', 'a']);
  });

  // A prompt created after the user arranged the list belongs on top, the same
  // as a new prompt does everywhere else in the library.
  it('puts a prompt created after the arrangement at the top', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => usePromptReorder(sourcesOf(ids)),
      { initialProps: { ids: ['a', 'b', 'c'] } },
    );

    act(() => result.current.onDragOver(dragEvent({ source: 'a', target: 'c' })));
    act(() => result.current.onDragEnd(dragEvent({ source: 'a', target: 'c' })));
    rerender({ ids: ['a', 'b', 'c', 'new'] });

    expect(idsOf(result.current.lists.global)).toEqual(['new', 'b', 'c', 'a']);
  });

  it('changes nothing for a drag that never moved over another card', () => {
    const { result } = renderHook(() => usePromptReorder(sourcesOf(['a', 'b', 'c'])));

    act(() => result.current.onDragEnd(dragEvent({ source: 'a', target: null })));

    expect(idsOf(result.current.lists.global)).toEqual(['a', 'b', 'c']);
  });
});
