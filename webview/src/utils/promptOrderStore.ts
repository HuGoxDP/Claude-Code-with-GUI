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
/**
 * The order of the category column, as category ids.
 *
 * Kept apart from the prompts' order because it is one order, not one per scope:
 * the categories are global and both scopes file their prompts under them.
 */
let categoryOrder: string[] = [];
/**
 * The order of the prompts INSIDE each category, by category id.
 *
 * A category has an order of its own on top of the library's, so the same prompt
 * can sit in different places in different categories. Nothing here for a
 * category nobody has arranged: it shows the library's order narrowed.
 */
let promptOrderByCategory: Record<string, PromptOrder> = {};
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

export function getCategoryOrder(): string[] {
  return categoryOrder;
}

/** Replace the category column's order. The updater gets the current one. */
export function updateCategoryOrder(update: (order: string[]) => string[]): void {
  categoryOrder = update(categoryOrder);
  notify();
}

export function getPromptOrderByCategory(): Record<string, PromptOrder> {
  return promptOrderByCategory;
}

/** Replace the per-category orders. The updater gets all of them. */
export function updatePromptOrderByCategory(
  update: (orders: Record<string, PromptOrder>) => Record<string, PromptOrder>,
): void {
  promptOrderByCategory = update(promptOrderByCategory);
  notify();
}

/** Forget every arrangement. For tests, which must not inherit each other's order. */
export function resetPromptOrder(): void {
  current = emptyPromptOrder();
  categoryOrder = [];
  promptOrderByCategory = {};
  notify();
}

/** The order of the prompts inside each category, re-read when either screen changes it. */
export function usePromptOrderByCategory(): Record<string, PromptOrder> {
  return useSyncExternalStore(subscribe, getPromptOrderByCategory);
}

/** The order, re-read whenever either screen changes it. */
export function usePromptOrder(): PromptOrder {
  return useSyncExternalStore(subscribe, getPromptOrder);
}

/** The category column's order, re-read whenever either screen changes it. */
export function useCategoryOrder(): string[] {
  return useSyncExternalStore(subscribe, getCategoryOrder);
}
