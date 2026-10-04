import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react';
import { usePromptReorder, type PromptReorderOptions } from '../usePromptReorder';
import { promptSortableId, type OrderView } from '@/utils/promptOrder';
import { resetPromptOrder, updatePromptOrder } from '@/utils/promptOrderStore';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({
  id,
  name: id,
  content: `${id} body`,
  createdAt: 1,
  updatedAt: 1,
});

const sources = (ids: string[]) => ({ global: ids.map(prompt), project: [] });
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

const members = (...ids: string[]) => (p: SavedPrompt) => ids.includes(p.id);
const category = (id: string): OrderView => ({ kind: 'category', id });

function drag(
  hook: { result: { current: ReturnType<typeof usePromptReorder<SavedPrompt>> } },
  source: string,
  target: string,
) {
  act(() => hook.result.current.onDragOver(dragEvent(source, target)));
  act(() => hook.result.current.onDragEnd(dragEvent(source, target)));
}

/**
 * Which order a drag changes depends on the view being shown: the library's own
 * in "all", the category's inside a category, and none in "uncategorised".
 */
describe('usePromptReorder across views', () => {
  beforeEach(() => {
    resetPromptOrder();
  });

  const render = (options: PromptReorderOptions<SavedPrompt>, ids = ['a', 'b', 'c', 'd']) =>
    renderHook((props: PromptReorderOptions<SavedPrompt>) => usePromptReorder(sources(ids), props), {
      initialProps: options,
    });

  // The same prompt can be first in one category and last in another, so a move
  // made inside a category has to leave the library's own order alone.
  it('changes the category\'s order and leaves the library\'s alone', () => {
    const hook = render({
      view: category('c1'),
      isMember: members('a', 'b', 'c'),
      isShown: members('a', 'b', 'c'),
    });

    drag(hook, 'a', 'c');
    expect(idsOf(hook.result.current.lists.global)).toEqual(['b', 'c', 'a']);

    hook.rerender({ view: { kind: 'all' } });
    expect(idsOf(hook.result.current.lists.global)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lets the same prompts sit in different places in different categories', () => {
    const hook = render({
      view: category('c1'),
      isMember: members('a', 'b', 'c'),
      isShown: members('a', 'b', 'c'),
    });
    drag(hook, 'a', 'c');

    hook.rerender({
      view: category('c2'),
      isMember: members('a', 'b', 'c'),
      isShown: members('a', 'b', 'c'),
    });

    expect(idsOf(hook.result.current.lists.global)).toEqual(['a', 'b', 'c']);
  });

  // A category nobody has arranged has no order of its own. It is the library's,
  // narrowed to what belongs to it.
  it('shows the library\'s order, narrowed, in a category nobody has arranged', () => {
    act(() => {
      updatePromptOrder(() => ({ global: ['d', 'c', 'b', 'a'], project: [] }));
    });

    const hook = render({
      view: category('c1'),
      isMember: members('a', 'c'),
      isShown: members('a', 'c'),
    });

    expect(idsOf(hook.result.current.lists.global)).toEqual(['c', 'a']);
  });

  // The category's order lists only its own prompts. One that is filed here later
  // is a prompt that order has not heard of, so it lands on top like any new one.
  it('puts a prompt filed into an arranged category on top', () => {
    const hook = render({
      view: category('c1'),
      isMember: members('a', 'b', 'c'),
      isShown: members('a', 'b', 'c'),
    });
    drag(hook, 'a', 'c');

    hook.rerender({
      view: category('c1'),
      isMember: members('a', 'b', 'c', 'd'),
      isShown: members('a', 'b', 'c', 'd'),
    });

    expect(idsOf(hook.result.current.lists.global)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('keeps a member the search hides in its place when the rest are reordered', () => {
    const hook = render({
      view: category('c1'),
      isMember: members('a', 'b', 'c', 'd'),
      isShown: members('a', 'c', 'd'),
    });

    drag(hook, 'a', 'd');
    expect(idsOf(hook.result.current.lists.global)).toEqual(['c', 'd', 'a']);

    hook.rerender({
      view: category('c1'),
      isMember: members('a', 'b', 'c', 'd'),
      isShown: members('a', 'b', 'c', 'd'),
    });
    expect(idsOf(hook.result.current.lists.global)).toEqual(['c', 'b', 'd', 'a']);
  });

  // "Uncategorised" is whatever is left over. It has no order of its own to
  // rearrange, so a drag there must not invent one.
  describe('"uncategorised"', () => {
    it('is not sortable', () => {
      const hook = render({ view: { kind: 'uncategorised' } });

      expect(hook.result.current.sortable).toBe(false);
    });

    it('leaves the order alone however a card is dragged', () => {
      const hook = render({ view: { kind: 'uncategorised' } });

      drag(hook, 'a', 'c');

      expect(idsOf(hook.result.current.lists.global)).toEqual(['a', 'b', 'c', 'd']);
      hook.rerender({ view: { kind: 'all' } });
      expect(idsOf(hook.result.current.lists.global)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('lists the cards in the library\'s order', () => {
      act(() => {
        updatePromptOrder(() => ({ global: ['d', 'c', 'b', 'a'], project: [] }));
      });

      const hook = render({ view: { kind: 'uncategorised' } });

      expect(idsOf(hook.result.current.lists.global)).toEqual(['d', 'c', 'b', 'a']);
    });
  });

  it('is sortable in "all" and inside a category', () => {
    expect(render({ view: { kind: 'all' } }).result.current.sortable).toBe(true);
    expect(render({ view: category('c1') }).result.current.sortable).toBe(true);
  });
});
