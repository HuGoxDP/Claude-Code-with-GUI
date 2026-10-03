import { useSyncExternalStore } from 'react';
import { emptyPromptOrder, type PromptOrder } from './promptOrder';

/**
 * Where the order the user dragged the prompts into is kept, for both screens.
 *
 * The library modal and the `!!` panel list the same prompts, so an order made
 * on one has to be the order on the other: arranging the library and then
 * finding the panel in the old order would read as the drag not having worked.
 * They are separate components that are never mounted together, so the order
 * lives outside both.
 *
 * It is held in memory and is gone when the page reloads. That is deliberate for
 * now: dragging is being built from the screen backwards, and nothing is written
 * to disk until the storage that can hold an order exists. When it does, this is
 * the one place to swap, and neither screen changes.
 */
let current: PromptOrder = emptyPromptOrder();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPromptOrder(): PromptOrder {
  return current;
}

/** Replace the order. The updater gets the current one and returns the next. */
export function updatePromptOrder(update: (order: PromptOrder) => PromptOrder): void {
  current = update(current);
  notify();
}

/** Forget every arrangement. For tests, which must not inherit each other's order. */
export function resetPromptOrder(): void {
  current = emptyPromptOrder();
  notify();
}

/** The order, re-read whenever either screen changes it. */
export function usePromptOrder(): PromptOrder {
  return useSyncExternalStore(subscribe, getPromptOrder);
}
