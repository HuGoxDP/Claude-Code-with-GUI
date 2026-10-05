import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { PromptTimeoutNotice, formatCountdown, pickTimedPrompt, promptTimeoutReason, usePromptTimeout } from '../PromptTimeout';

describe('usePromptTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down and declines once, when the time is up', () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => usePromptTimeout('permission:1', 30, onTimeout));
    expect(result.current).toBe(30);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(20);
    act(() => vi.advanceTimersByTime(25_000));
    expect(result.current).toBe(0);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('runs no timer without a prompt or without a timeout', () => {
    const onTimeout = vi.fn();
    const none = renderHook(() => usePromptTimeout(null, 30, onTimeout));
    const off = renderHook(() => usePromptTimeout('permission:1', null, onTimeout));
    act(() => vi.advanceTimersByTime(60_000));
    expect(none.result.current).toBeNull();
    expect(off.result.current).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('gives each new prompt its own full wait, and keeps the deadline across re-renders', () => {
    const onTimeout = vi.fn();
    const { result, rerender } = renderHook(({ key }) => usePromptTimeout(key, 30, onTimeout), { initialProps: { key: 'permission:1' } });
    act(() => vi.advanceTimersByTime(20_000));
    rerender({ key: 'permission:1' });
    expect(result.current).toBe(10);
    rerender({ key: 'plan:2' });
    expect(result.current).toBe(30);
    act(() => vi.advanceTimersByTime(29_000));
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('measures the clock, so a tab whose timers ran late still declines on time', () => {
    const onTimeout = vi.fn();
    renderHook(() => usePromptTimeout('question:1', 30, onTimeout));
    // A sleeping tab: the clock moves on while no interval fires.
    vi.setSystemTime(Date.now() + 45_000);
    act(() => vi.advanceTimersByTime(1_000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('prompt timeout wording', () => {
  it('formats the countdown like a clock', () => {
    expect(formatCountdown(299)).toBe('4:59');
    expect(formatCountdown(7)).toBe('0:07');
    expect(formatCountdown(3600)).toBe('1:00:00');
  });

  it('tells Claude nobody answered, not that the user said no', () => {
    expect(promptTimeoutReason(300)).toBe(
      'No answer came within 5:00, so this was declined automatically. The user may be away; continue without it if you can, or ask again later.',
    );
  });

  it('shows the time left above the prompt', () => {
    render(<PromptTimeoutNotice remaining={299} />);
    expect(screen.getByTestId('prompt-timeout').textContent).toBe('Declined automatically in 4:59 if you do not answer');
  });
});

describe('pickTimedPrompt', () => {
  const actions = () => ({ declineQuestion: vi.fn(), declinePlan: vi.fn(), declinePermission: vi.fn() });

  it('times the prompt the footer shows, and declines it through its own channel', () => {
    const a = actions();
    const both = pickTimedPrompt({ question: null, planRequestId: 'plan-1', permissionRequestId: 'perm-1' }, a);
    expect(both?.key).toBe('plan:plan-1');
    both?.decline('why');
    expect(a.declinePlan).toHaveBeenCalledWith('plan-1', 'why');
    expect(a.declinePermission).not.toHaveBeenCalled();

    const permission = pickTimedPrompt({ question: null, planRequestId: null, permissionRequestId: 'perm-1' }, a);
    permission?.decline('why');
    expect(a.declinePermission).toHaveBeenCalledWith('perm-1', 'why');

    const question = pickTimedPrompt({ question: { toolUseId: 'tu-1', controlRequestId: 'req-1' }, planRequestId: 'plan-1', permissionRequestId: null }, a);
    expect(question?.key).toBe('question:req-1');
    question?.decline('why');
    expect(a.declineQuestion).toHaveBeenCalledWith('tu-1', 'req-1', 'why');
  });

  it('runs no timer for a question that cannot be answered by id, or when nothing waits', () => {
    const a = actions();
    expect(pickTimedPrompt({ question: { toolUseId: 'tu-1' }, planRequestId: null, permissionRequestId: 'perm-1' }, a)).toBeNull();
    expect(pickTimedPrompt({ question: null, planRequestId: null, permissionRequestId: null }, a)).toBeNull();
  });
});
