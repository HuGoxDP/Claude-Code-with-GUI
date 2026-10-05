import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_CATEGORIES } from '../promptCategories';
import {
  getCategoryOrder,
  getPromptOrder,
  getPromptOrderByCategory,
  resetPromptOrder,
  updateCategoryOrder,
  updatePromptOrder,
} from '../promptOrderStore';
import { commitPromptOrder, moveCategoryBy, movePromptBy } from '../promptReorderCommands';
import type { OrderView } from '../promptOrder';
import type { PromptCategory, SavedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({
  id,
  name: id,
  content: `${id} body`,
  createdAt: 1,
  updatedAt: 1,
});

const sources = (ids: string[]) => ({ global: ids.map(prompt), project: [] });
const everything = () => true;
const all: OrderView = { kind: 'all' };
const category = (id: string): PromptCategory => ({ id, name: id, createdAt: 1 });

/**
 * A key press and a drag make the same move, so they go through the same
 * functions. These are those functions.
 */
describe('promptReorderCommands', () => {
  beforeEach(() => {
    resetPromptOrder();
  });

  describe('movePromptBy', () => {
    const move = (
      delta: -1 | 1,
      promptId: string,
      overrides: Partial<Parameters<typeof movePromptBy>[0]> = {},
    ) =>
      movePromptBy({
        view: all,
        sources: sources(['a', 'b', 'c']),
        isMember: everything,
        shownIds: { global: ['a', 'b', 'c'], project: [] },
        scope: 'global',
        promptId,
        delta,
        ...overrides,
      });

    it('moves a card one step down and keeps it', () => {
      expect(move(1, 'a')).toBe(true);

      expect(getPromptOrder().global).toEqual(['b', 'a', 'c']);
    });

    it('moves a card one step up', () => {
      expect(move(-1, 'c')).toBe(true);

      expect(getPromptOrder().global).toEqual(['a', 'c', 'b']);
    });

    // There is nowhere further to go, and nothing should be written for it.
    it('does nothing at either end of the list', () => {
      expect(move(-1, 'a')).toBe(false);
      expect(move(1, 'c')).toBe(false);

      expect(getPromptOrder().global).toEqual([]);
    });

    it('does nothing for a card that is not on screen', () => {
      expect(move(1, 'zzz')).toBe(false);
    });

    // The next card ON SCREEN, not the next one in the full list: a card the
    // search hides keeps its place instead of being stepped over.
    it('steps over a hidden card and leaves it where it was', () => {
      const moved = move(1, 'a', {
        sources: sources(['a', 'b', 'c', 'd']),
        shownIds: { global: ['a', 'c', 'd'], project: [] },
      });

      expect(moved).toBe(true);
      expect(getPromptOrder().global).toEqual(['c', 'b', 'a', 'd']);
    });

    it('moves a card inside a category without touching the library\'s order', () => {
      const moved = move(1, 'a', { view: { kind: 'category', id: 'c1' } });

      expect(moved).toBe(true);
      expect(getPromptOrderByCategory().c1.global).toEqual(['b', 'a', 'c']);
      expect(getPromptOrder().global).toEqual([]);
    });

    // "Uncategorised" is whatever is left over and has no order of its own.
    it('moves nothing in "uncategorised"', () => {
      expect(move(1, 'a', { view: { kind: 'uncategorised' } })).toBe(false);

      expect(getPromptOrder().global).toEqual([]);
      expect(getPromptOrderByCategory()).toEqual({});
    });
  });

  describe('commitPromptOrder', () => {
    it('keeps nothing in "uncategorised"', () => {
      commitPromptOrder({
        view: { kind: 'uncategorised' },
        sources: sources(['a', 'b']),
        isMember: everything,
        visibleIds: { global: ['b', 'a'], project: [] },
      });

      expect(getPromptOrder().global).toEqual([]);
    });

    // The category's order lists only its own prompts, so a prompt filed there
    // later has no place in it yet and lands on top.
    it('lists only the category\'s own prompts in a category order', () => {
      commitPromptOrder({
        view: { kind: 'category', id: 'c1' },
        sources: sources(['a', 'b', 'c']),
        isMember: (p) => p.id !== 'b',
        visibleIds: { global: ['c', 'a'], project: [] },
      });

      expect(getPromptOrderByCategory().c1.global).toEqual(['c', 'a']);
    });
  });

  describe('moveCategoryBy', () => {
    const categories = ['a', 'b', 'c'].map(category);

    // "All" is a row of the column too, and starts on top of it.
    it('moves a category one step down the column', () => {
      expect(moveCategoryBy(categories, 'a', 1)).toBe(true);

      expect(getCategoryOrder()).toEqual([ALL_CATEGORIES, 'b', 'a', 'c']);
    });

    it('moves a category one step up the column', () => {
      expect(moveCategoryBy(categories, 'c', -1)).toBe(true);

      expect(getCategoryOrder()).toEqual([ALL_CATEGORIES, 'a', 'c', 'b']);
    });

    it('lets a category move up past "All"', () => {
      expect(moveCategoryBy(categories, 'a', -1)).toBe(true);

      expect(getCategoryOrder()).toEqual(['a', ALL_CATEGORIES, 'b', 'c']);
    });

    it('moves "All" like any other row', () => {
      expect(moveCategoryBy(categories, ALL_CATEGORIES, 1)).toBe(true);

      expect(getCategoryOrder()).toEqual(['a', ALL_CATEGORIES, 'b', 'c']);
    });

    it('does nothing at the bottom, or at the top for "All"', () => {
      expect(moveCategoryBy(categories, 'c', 1)).toBe(false);
      expect(moveCategoryBy(categories, ALL_CATEGORIES, -1)).toBe(false);

      expect(getCategoryOrder()).toEqual([]);
    });

    it('does nothing for an id that is not a category', () => {
      expect(moveCategoryBy(categories, 'all', 1)).toBe(false);
    });

    it('starts from the order the user already arranged', () => {
      updateCategoryOrder(() => ['c', 'a', 'b']);

      expect(moveCategoryBy(categories, 'c', 1)).toBe(true);

      // "All" was not named, so it was on top, and the move starts from there.
      expect(getCategoryOrder()).toEqual([ALL_CATEGORIES, 'a', 'c', 'b']);
    });
  });

  it('reads the library\'s order a move starts from', () => {
    updatePromptOrder(() => ({ global: ['c', 'b', 'a'], project: [] }));

    movePromptBy({
      view: all,
      sources: sources(['a', 'b', 'c']),
      isMember: everything,
      shownIds: { global: ['c', 'b', 'a'], project: [] },
      scope: 'global',
      promptId: 'c',
      delta: 1,
    });

    expect(getPromptOrder().global).toEqual(['b', 'c', 'a']);
  });
});
