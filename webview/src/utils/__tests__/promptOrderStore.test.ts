import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  getPromptOrder,
  resetPromptOrder,
  updatePromptOrder,
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
