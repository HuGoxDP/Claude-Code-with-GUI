import { useSyncExternalStore } from 'react';
import { emptyPromptOrder, type PromptOrder } from './promptOrder';
import type { PromptScope } from '@/types/prompt';

/**
 * Where the order the user dragged the prompts into is kept, for both screens.
 *
 * The library modal and the `!!` panel list the same prompts, so an order made
 * on one has to be the order on the other: arranging the library and then
 * finding the panel in the old order would read as the drag not having worked.
 * They are separate components that are never mounted together, so the order
 * lives outside both.
 *
 * The backend owns the order. This store is a cache of it: it is filled from the
 * replies to GET_PROMPTS and GET_PROMPT_CATEGORIES ({@link hydratePromptOrder},
 * {@link hydrateCategoryOrder}), and a drag changes it at once, so the screen
 * moves before the round trip, and then hands the change to the {@link
 * PromptOrderSink} to be saved.
 */
export interface PromptOrderSink {
  /** Save the order of one scope's prompts: the library's own, or one category's. */
  persistPromptOrder: (scope: PromptScope, ids: string[], categoryId?: string) => void;
  /** Save the order of the category column. */
  persistCategoryOrder: (ids: string[]) => void;
}

/**
 * Every screen that can save an order, oldest first. The newest one saves.
 *
 * A stack and not a single slot: the `!!` panel registers when the chat opens and
 * stays for as long as it lives, and the library modal registers on top of it
 * while it is open. When the modal closes, the panel has to be the one that
 * saves again. With one slot the modal's leaving emptied it, and every order
 * made in the panel afterwards was shown but never saved.
 */
const sinks: PromptOrderSink[] = [];

/** Where changes are saved. Answers a function that takes back only this registration. */
export function setPromptOrderSink(next: PromptOrderSink): () => void {
  sinks.push(next);
  return () => {
    const at = sinks.indexOf(next);
    if (at !== -1) sinks.splice(at, 1);
  };
}

/** The sink that saves right now, if any screen has registered one. */
function currentSink(): PromptOrderSink | null {
  return sinks[sinks.length - 1] ?? null;
}

function sameIds(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** The library's own ("All") order of each scope, as prompt ids. */
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
  const before = current;
  current = update(current);
  notify();
  for (const scope of ['global', 'project'] as const) {
    if (!sameIds(before[scope], current[scope])) currentSink()?.persistPromptOrder(scope, current[scope]);
  }
}

export function getCategoryOrder(): string[] {
  return categoryOrder;
}

/** Replace the category column's order. The updater gets the current one. */
export function updateCategoryOrder(update: (order: string[]) => string[]): void {
  const before = categoryOrder;
  categoryOrder = update(categoryOrder);
  notify();
  if (!sameIds(before, categoryOrder)) currentSink()?.persistCategoryOrder(categoryOrder);
}

export function getPromptOrderByCategory(): Record<string, PromptOrder> {
  return promptOrderByCategory;
}

/** Replace the per-category orders. The updater gets all of them. */
export function updatePromptOrderByCategory(
  update: (orders: Record<string, PromptOrder>) => Record<string, PromptOrder>,
): void {
  const before = promptOrderByCategory;
  promptOrderByCategory = update(promptOrderByCategory);
  notify();
  for (const [categoryId, order] of Object.entries(promptOrderByCategory)) {
    for (const scope of ['global', 'project'] as const) {
      if (!sameIds(before[categoryId]?.[scope], order[scope])) {
        currentSink()?.persistPromptOrder(scope, order[scope], categoryId);
      }
    }
  }
}

/**
 * Fill the cache from what the backend answered for ONE scope.
 *
 * [ids] is the scope's prompts in the library's own order and [byCategory] the
 * order inside each category. Nothing is saved: this is the saved order coming
 * back. The other scope's entries are left alone, because the two scopes are
 * read by separate requests.
 */
export function hydratePromptOrder(
  scope: PromptScope,
  ids: string[],
  byCategory: Record<string, string[]>,
): void {
  current = { ...current, [scope]: ids };
  const next: Record<string, PromptOrder> = {};
  for (const categoryId of new Set([...Object.keys(promptOrderByCategory), ...Object.keys(byCategory)])) {
    const order = { ...(promptOrderByCategory[categoryId] ?? emptyPromptOrder()) };
    order[scope] = byCategory[categoryId] ?? [];
    next[categoryId] = order;
  }
  promptOrderByCategory = next;
  notify();
}

/** Fill the cache with the category column the backend answered with. Saves nothing. */
export function hydrateCategoryOrder(ids: string[]): void {
  categoryOrder = ids;
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
