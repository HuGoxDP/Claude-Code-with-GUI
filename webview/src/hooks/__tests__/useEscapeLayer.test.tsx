import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeLayer } from '../useEscapeLayer';

const press = (key = 'Escape') => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('useEscapeLayer', () => {
  // A stand-in for the composer: it reads Escape in the bubble phase and stops the stream.
  const composer = vi.fn();
  const listen = () => window.addEventListener('keydown', composer);
  afterEach(() => {
    window.removeEventListener('keydown', composer);
    composer.mockClear();
  });

  it('hands Escape to the overlay and keeps it from the composer', () => {
    listen();
    const close = vi.fn(() => true);
    renderHook(() => useEscapeLayer(close));

    const event = press();

    expect(close).toHaveBeenCalledTimes(1);
    expect(composer).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps Escape from the composer even when the composer listened first', () => {
    // Registered BEFORE the overlay, which is the order that made a bubble-phase
    // overlay lose the race.
    listen();
    renderHook(() => useEscapeLayer(() => true));

    press();

    expect(composer).not.toHaveBeenCalled();
  });

  it('lets other keys through', () => {
    listen();
    const close = vi.fn(() => true);
    renderHook(() => useEscapeLayer(close));

    press('Enter');

    expect(close).not.toHaveBeenCalled();
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it('only answers for the top-most overlay', () => {
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => true);
    renderHook(() => useEscapeLayer(lower));
    renderHook(() => useEscapeLayer(upper));

    press();

    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it('gives Escape back to the overlay below once the top one is gone', () => {
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => true);
    renderHook(() => useEscapeLayer(lower));
    const top = renderHook(() => useEscapeLayer(upper));
    top.unmount();

    press();

    expect(lower).toHaveBeenCalledTimes(1);
  });

  it('lets Escape travel on when the overlay does not use it', () => {
    listen();
    renderHook(() => useEscapeLayer(() => false));

    const event = press();

    expect(composer).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing while inactive', () => {
    listen();
    const close = vi.fn(() => true);
    renderHook(() => useEscapeLayer(close, false));

    press();

    expect(close).not.toHaveBeenCalled();
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    listen();
    const close = vi.fn(() => true);
    renderHook(() => useEscapeLayer(close)).unmount();

    press();

    expect(close).not.toHaveBeenCalled();
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it('calls the newest handler without re-subscribing', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const { rerender } = renderHook(({ fn }) => useEscapeLayer(fn), { initialProps: { fn: first } });
    rerender({ fn: second });

    press();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
