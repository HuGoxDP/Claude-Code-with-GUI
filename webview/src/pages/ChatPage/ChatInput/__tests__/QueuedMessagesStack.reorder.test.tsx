import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import type { QueuedMessage } from '@/shared';

/**
 * Reordering the queued follow-up messages (parity item B9, ported from CC GUI).
 *
 * The drag itself is dnd-kit's and needs real layout, which jsdom does not do,
 * so the provider is replaced by one that hands its callbacks to the test and
 * `move` by a fixed reorder. What is under test is what the stack does with a
 * drag: when it asks the backend, what it shows meanwhile, and what it leaves
 * alone.
 */

let handlers: {
  onDragStart?: () => void;
  onDragOver?: (event: unknown) => void;
  onDragEnd?: (event: { canceled: boolean }) => void;
} = {};

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: (props: { children: React.ReactNode } & typeof handlers) => {
    handlers = props;
    return props.children;
  },
}));
vi.mock('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({ ref: () => {}, isDragging: false }),
}));
// Every drag in these tests moves the last message to the top.
vi.mock('@dnd-kit/helpers', () => ({
  move: (items: string[]) => [items[items.length - 1], ...items.slice(0, -1)],
}));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/Tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => children }));

const { QueuedMessagesStack, arrangeQueue } = await import('../QueuedMessagesStack');

const entry = (id: string): QueuedMessage => ({ id, content: `message ${id}`, queuedAt: 0 });
const shownOrder = () =>
  Array.from(document.querySelectorAll('[data-queued-message]')).map((el) => el.getAttribute('data-queued-message'));

beforeEach(() => {
  handlers = {};
});

describe('arrangeQueue', () => {
  const entries = [entry('a'), entry('b'), entry('c')];

  it('keeps the queue order when nothing is being arranged', () => {
    expect(arrangeQueue(entries, null)).toBe(entries);
  });

  it('follows the ids, skipping released ones and keeping new ones after them', () => {
    expect(arrangeQueue(entries, ['c', 'gone', 'a']).map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('QueuedMessagesStack reordering', () => {
  it('asks the backend for the dropped order and shows it until the backend answers', () => {
    const onReorder = vi.fn();
    const entries = [entry('a'), entry('b'), entry('c')];
    const { rerender } = render(<QueuedMessagesStack entries={entries} onCancel={vi.fn()} onReorder={onReorder} />);

    act(() => handlers.onDragStart?.());
    expect(screen.getByTestId('queued-messages-stack').hasAttribute('data-dragging')).toBe(true);
    act(() => handlers.onDragEnd?.({ canceled: false }));

    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
    expect(shownOrder()).toEqual(['c', 'a', 'b']);
    expect(screen.getByTestId('queued-messages-stack').hasAttribute('data-dragging')).toBe(false);

    // The backend's push is the truth from here on, even if it differs.
    rerender(<QueuedMessagesStack entries={[entry('b'), entry('a')]} onCancel={vi.fn()} onReorder={onReorder} />);
    expect(shownOrder()).toEqual(['b', 'a']);
  });

  it('asks nothing when the drag is cancelled', () => {
    const onReorder = vi.fn();
    render(<QueuedMessagesStack entries={[entry('a'), entry('b'), entry('c')]} onCancel={vi.fn()} onReorder={onReorder} />);

    act(() => handlers.onDragStart?.());
    act(() => handlers.onDragOver?.({}));
    expect(shownOrder()).toEqual(['c', 'a', 'b']);
    act(() => handlers.onDragEnd?.({ canceled: true }));

    expect(onReorder).not.toHaveBeenCalled();
    expect(shownOrder()).toEqual(['a', 'b', 'c']);
  });

  it('offers a drag handle per message only when there is something to reorder', () => {
    const { rerender } = render(
      <QueuedMessagesStack entries={[entry('a'), entry('b')]} onCancel={vi.fn()} onReorder={vi.fn()} />,
    );
    expect(screen.getAllByRole('button', { name: 'chatInput.queuedMessages.reorder' })).toHaveLength(2);

    rerender(<QueuedMessagesStack entries={[entry('a')]} onCancel={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'chatInput.queuedMessages.reorder' })).toBeNull();

    rerender(<QueuedMessagesStack entries={[entry('a'), entry('b')]} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'chatInput.queuedMessages.reorder' })).toBeNull();
  });

  it('still cancels a message by its own button', () => {
    const onCancel = vi.fn();
    render(<QueuedMessagesStack entries={[entry('a'), entry('b')]} onCancel={onCancel} onReorder={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'chatInput.queuedMessages.cancel' })[1]);
    expect(onCancel).toHaveBeenCalledWith('b');
  });
});
