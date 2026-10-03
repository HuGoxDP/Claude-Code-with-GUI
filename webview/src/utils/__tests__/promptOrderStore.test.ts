import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  getCategoryOrder,
  getPromptOrder,
  getPromptOrderByCategory,
  hydrateCategoryOrder,
  hydratePromptOrder,
  resetPromptOrder,
  setPromptOrderSink,
  updateCategoryOrder,
  updatePromptOrder,
  updatePromptOrderByCategory,
  usePromptOrder,
} from '../promptOrderStore';

/**
 * The library modal and the `!!` panel are separate components that are never on
 * screen together, and an order made on one has to be the order on the other.
 * The store is what they share.
 */
describe('promptOrderStore', () => {
  beforeEach(() => {
    resetPromptOrder();
  });

  it('starts with nothing arranged', () => {
    expect(getPromptOrder()).toEqual({ global: [], project: [] });
  });

  it('hands the updater the order as it stands', () => {
    updatePromptOrder((order) => ({ ...order, global: ['a', 'b'] }));
    let seen: string[] = [];
    updatePromptOrder((order) => {
      seen = order.global;
      return order;
    });

    expect(seen).toEqual(['a', 'b']);
  });

  // Two readers stand for the two screens: whichever is mounted when the other
  // one is used must still see the change.
  it('tells every reader when the order changes', () => {
    const first = renderHook(() => usePromptOrder());
    const second = renderHook(() => usePromptOrder());

    act(() => updatePromptOrder((order) => ({ ...order, project: ['p2', 'p1'] })));

    expect(first.result.current.project).toEqual(['p2', 'p1']);
    expect(second.result.current.project).toEqual(['p2', 'p1']);
  });

  it('forgets every arrangement on reset', () => {
    updatePromptOrder(() => ({ global: ['a'], project: ['b'] }));
    resetPromptOrder();

    expect(getPromptOrder()).toEqual({ global: [], project: [] });
  });
});

describe('promptOrderStore saving and hydration', () => {
  const persistPromptOrder = vi.fn();
  const persistCategoryOrder = vi.fn();
  let release: () => void;

  beforeEach(() => {
    resetPromptOrder();
    persistPromptOrder.mockClear();
    persistCategoryOrder.mockClear();
    release = setPromptOrderSink({ persistPromptOrder, persistCategoryOrder });
  });

  afterEach(() => release());

  it('hands a changed library order to the sink, one scope at a time', () => {
    updatePromptOrder(() => ({ global: ['b', 'a'], project: [] }));

    expect(persistPromptOrder).toHaveBeenCalledTimes(1);
    expect(persistPromptOrder).toHaveBeenCalledWith('global', ['b', 'a']);
  });

  it('hands a changed category order to the sink with the category it belongs to', () => {
    updatePromptOrderByCategory(() => ({ c1: { global: ['b', 'a'], project: [] } }));

    expect(persistPromptOrder).toHaveBeenCalledTimes(1);
    expect(persistPromptOrder).toHaveBeenCalledWith('global', ['b', 'a'], 'c1');
  });

  it('hands a changed category column to the sink', () => {
    updateCategoryOrder(() => ['c2', 'c1']);

    expect(persistCategoryOrder).toHaveBeenCalledWith(['c2', 'c1']);
  });

  it('saves nothing when an update leaves the order as it was', () => {
    updatePromptOrder((order) => order);
    updateCategoryOrder((order) => order);

    expect(persistPromptOrder).not.toHaveBeenCalled();
    expect(persistCategoryOrder).not.toHaveBeenCalled();
  });

  it('saves nothing when the order is filled from the backend', () => {
    hydratePromptOrder('global', ['b', 'a'], { c1: ['a'] });
    hydrateCategoryOrder(['c2', 'c1']);

    expect(persistPromptOrder).not.toHaveBeenCalled();
    expect(persistCategoryOrder).not.toHaveBeenCalled();
    expect(getPromptOrder().global).toEqual(['b', 'a']);
    expect(getPromptOrderByCategory().c1?.global).toEqual(['a']);
    expect(getCategoryOrder()).toEqual(['c2', 'c1']);
  });

  it('leaves the other scope alone when one scope is read', () => {
    hydratePromptOrder('project', ['p1'], { c1: ['p1'] });
    hydratePromptOrder('global', ['g1'], {});

    expect(getPromptOrder()).toEqual({ global: ['g1'], project: ['p1'] });
    expect(getPromptOrderByCategory().c1).toEqual({ global: [], project: ['p1'] });
  });

  it('forgets a category order the backend no longer has', () => {
    hydratePromptOrder('global', ['a'], { c1: ['a'] });
    hydratePromptOrder('global', ['a'], {});

    expect(getPromptOrderByCategory().c1?.global).toEqual([]);
  });

  it('stops saving once its registration is released', () => {
    release();
    updatePromptOrder(() => ({ global: ['x'], project: [] }));

    expect(persistPromptOrder).not.toHaveBeenCalled();
  });

  it('does not let an old registration release a newer one', () => {
    const newer = vi.fn();
    const releaseNewer = setPromptOrderSink({ persistPromptOrder: newer, persistCategoryOrder: vi.fn() });
    release();
    updatePromptOrder(() => ({ global: ['x'], project: [] }));

    expect(newer).toHaveBeenCalled();
    releaseNewer();
  });
});
