import { useEffect, useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import type { QueuedMessage } from '@/shared';
import { MessageBox } from '../message-renderers/components/MessageBox';
import { DragHandleIcon } from '../SessionHeader/dock/DragHandleIcon';

interface QueuedMessagesStackProps {
  /** The session's backend-owned queue, oldest first — see ChatStreamContext's `queuedMessages`. */
  entries: QueuedMessage[];
  onCancel: (id: string) => void;
  /** Ask the backend for this order (the first id is released next). Without it the stack cannot be reordered. */
  onReorder?: (ids: string[]) => void;
}

/**
 * Tailwind's JIT scanner needs a complete class name literally present in
 * source; `translate-y-[${n}px]` built at render time is invisible to it and
 * generates no CSS. This table stands in for "offset by n steps of depth" —
 * indexed instead of computed, so every value it can produce already exists
 * in the compiled stylesheet. Four entries is plenty: a fifth message behind
 * the top one is fully hidden either way, so it costs nothing to share the
 * deepest step with everything past it.
 */
const STACK_TRANSLATE = ['translate-y-0', 'translate-y-1', 'translate-y-[6px]', 'translate-y-[9px]'];
const STACK_SCALE = ['scale-100', 'scale-[0.97]', 'scale-[0.94]', 'scale-[0.91]'];

/**
 * [entries] in the order [ids] names. An entry the list does not name (queued
 * after the drag started) keeps its place after the named ones, and an id with
 * no entry (released meanwhile) is skipped — the same reconciliation the
 * backend applies, so the stack never shows a message twice or loses one.
 */
export function arrangeQueue(entries: QueuedMessage[], ids: readonly string[] | null): QueuedMessage[] {
  if (!ids) return entries;
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const named: QueuedMessage[] = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) continue;
    named.push(entry);
    byId.delete(id);
  }
  return [...named, ...entries.filter(entry => byId.has(entry.id))];
}

/**
 * The queued follow-up messages, drawn above the composer.
 *
 * Every message the session's backend queue is holding (see
 * `messageQueue.ts` on the backend and `ChatStreamContext.queuedMessages`)
 * gets one bubble, oldest first. At rest they read as a single card with a
 * slight step behind it per extra message and a count badge on the corner;
 * hovering the stack (or moving focus into it) fans them out into an ordinary
 * list so each one can be read, cancelled, or dragged by its handle to change
 * which goes next. The bubble ITSELF still expands to its full text on click,
 * same as any other chat bubble — `MessageBox`'s own behavior, unmodified.
 *
 * The message on top at rest is the OLDEST, not the most recently queued: it
 * is the one about to be released to the CLI next, which is the one worth
 * seeing without having to hover first. Dragging another message to the top
 * makes it the next one.
 */
export function QueuedMessagesStack({ entries, onCancel, onReorder }: QueuedMessagesStackProps) {
  const { t } = useTranslation('chat');

  // The order being previewed mid-drag, null when no drag is in progress. The
  // backend's queue is not touched until the drop lands, so a cancelled drag
  // (Esc, lost pointer) restores the original order by dropping the preview.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  // The order just dropped, shown until the backend's push answers it, so the
  // stack does not snap back to the old order for the length of a round trip.
  const [sentOrder, setSentOrder] = useState<string[] | null>(null);
  const lastEntries = useRef(entries);
  useEffect(() => {
    if (lastEntries.current === entries) return;
    lastEntries.current = entries;
    setSentOrder(null);
  }, [entries]);

  if (entries.length === 0) return null;

  const shown = arrangeQueue(entries, dragOrder ?? sentOrder);
  const order = shown.map(entry => entry.id);
  const canReorder = Boolean(onReorder) && shown.length > 1;
  // Kept fanned out for the whole drag: the pointer leaves the stack as soon as
  // the dragged bubble moves past its edge, and a hover-only layout would
  // collapse the list under it.
  const dragging = dragOrder !== null;

  return (
    <DragDropProvider
      onDragStart={() => setDragOrder(order)}
      onDragOver={(event) => setDragOrder((current) => move(current ?? order, event))}
      onDragEnd={(event) => {
        setDragOrder(null);
        if (event.canceled) return;
        const next = move(order, event);
        if (next.every((id, index) => id === entries[index]?.id) && next.length === entries.length) return;
        setSentOrder(next);
        onReorder?.(next);
      }}
    >
      <div className="group/queue relative mb-2" data-testid="queued-messages-stack" data-dragging={dragging || undefined}>
        {shown.length > 1 && (
          <div
            // Fades out once the stack is open — the expanded list already
            // answers "how many" by being that many bubbles tall.
            className={`absolute -top-2 -end-2 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border border-border-default bg-surface-raised px-1 text-[0.6923rem] font-medium text-text-secondary transition-opacity duration-150 group-hover/queue:opacity-0 group-focus-within/queue:opacity-0 ${
              dragging ? 'opacity-0' : ''
            }`}
          >
            {shown.length}
          </div>
        )}
        <div className="relative">
          {shown.map((entry, index) => (
            <QueuedMessageRow
              key={entry.id}
              entry={entry}
              index={index}
              fanned={dragging}
              canReorder={canReorder}
              onCancel={onCancel}
              cancelLabel={t('chatInput.queuedMessages.cancel')}
              reorderLabel={t('chatInput.queuedMessages.reorder')}
            />
          ))}
        </div>
      </div>
    </DragDropProvider>
  );
}

interface QueuedMessageRowProps {
  entry: QueuedMessage;
  index: number;
  /** Laid out as an open list regardless of hover, while a drag is in progress. */
  fanned: boolean;
  canReorder: boolean;
  onCancel: (id: string) => void;
  cancelLabel: string;
  reorderLabel: string;
}

/**
 * One bubble of the stack, and its place in the drag order. Its own component
 * because `useSortable` is one hook per row, and a hook cannot be called in a
 * loop.
 */
function QueuedMessageRow(props: QueuedMessageRowProps) {
  const { entry, index, fanned, canReorder, onCancel, cancelLabel, reorderLabel } = props;
  const handle = useRef<HTMLButtonElement>(null);
  const { ref, isDragging } = useSortable({ id: entry.id, index, handle, disabled: !canReorder });

  const isTop = index === 0;
  const depthIdx = Math.min(index, STACK_TRANSLATE.length - 1);
  // The lifted bubble paints above its neighbours as they slide past it.
  const layer = isDragging ? 'z-20 opacity-80' : isTop ? 'z-10' : 'z-0';
  let placement: string;
  if (isTop) {
    placement = 'relative';
  } else if (fanned) {
    placement = 'relative mt-1.5';
  } else {
    placement = [
      'absolute inset-x-0 top-0 pointer-events-none opacity-70',
      'transition-all duration-150 ease-out',
      STACK_TRANSLATE[depthIdx],
      STACK_SCALE[depthIdx],
      'group-hover/queue:static group-hover/queue:mt-1.5 group-hover/queue:translate-y-0',
      'group-hover/queue:scale-100 group-hover/queue:opacity-100 group-hover/queue:pointer-events-auto',
      'group-focus-within/queue:static group-focus-within/queue:mt-1.5 group-focus-within/queue:translate-y-0',
      'group-focus-within/queue:scale-100 group-focus-within/queue:opacity-100 group-focus-within/queue:pointer-events-auto',
    ].join(' ');
  }

  return (
    <div ref={ref} data-queued-message={entry.id} className={`${placement} ${layer}`}>
      <div className="group/bubble relative min-w-0">
        {/* `compact` caps this at one line until clicked — the requirement a
            queued bubble has that an ordinary sent bubble does not. */}
        <MessageBox variant="compact">
          <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
            {entry.content}
          </div>
        </MessageBox>
        {canReorder && (
          // The opposite corner from the cancel button, in the same chip. A
          // real <button> so the drag layer's keyboard sensor can reach it:
          // focus it, Space to pick up, arrows to move, Space to drop, Esc to
          // put it back. The swallowed click keeps MessageBox from toggling.
          <div className="absolute -top-2 -start-2 z-[2]" onClick={e => e.stopPropagation()}>
            <Tooltip content={reorderLabel} placement="top">
              <button
                type="button"
                ref={handle}
                aria-label={reorderLabel}
                className="flex items-center justify-center w-5 h-5 rounded-full border border-border-default bg-surface-raised text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all opacity-0 group-hover/bubble:opacity-100 focus-visible:opacity-100 cursor-grab select-none"
              >
                <DragHandleIcon className="h-3 shrink-0" />
              </button>
            </Tooltip>
          </div>
        )}
        {/* Same corner and swallowed-click pattern as `SendActionMenu`: without
            stopping propagation here, the click would also toggle MessageBox's
            own expand, which sits directly underneath this button. */}
        <div className="absolute -top-2 -end-2 z-[2]" onClick={e => e.stopPropagation()}>
          <Tooltip content={cancelLabel} placement="top">
            <button
              type="button"
              onClick={() => onCancel(entry.id)}
              aria-label={cancelLabel}
              className="flex items-center justify-center w-5 h-5 rounded-full border border-border-default bg-surface-raised text-text-tertiary hover:text-state-error-fg hover:bg-surface-hover transition-all opacity-0 group-hover/bubble:opacity-100 focus-visible:opacity-100 cursor-pointer"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
