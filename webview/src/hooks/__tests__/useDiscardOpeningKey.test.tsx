import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useDiscardOpeningKey } from '../useDiscardOpeningKey';

/**
 * A field opened by a shortcut. Under an IME the shortcut's own key arrives in
 * the field a moment after it opened, as a composition that preventDefault on the
 * keydown cannot stop: a Korean user pressing the key that types `e` (`ㄷ`) got a
 * field that opened with `ㄷ` typed into it instead of the name it should show.
 */
function Field({ original = '개발', onBlurSeen = vi.fn() }: { original?: string; onBlurSeen?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(original);
  const discarding = useDiscardOpeningKey(ref, 'one', () => setDraft(original));
  return (
    <input
      ref={ref}
      data-testid="field"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!discarding.current) onBlurSeen();
      }}
    />
  );
}

const field = (container: HTMLElement) => container.querySelector('input') as HTMLInputElement;

describe('useDiscardOpeningKey', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Moves the clock the hook reads, so "a moment after opening" and "later" can both be shown. */
  const clock = (now: number) => vi.spyOn(performance, 'now').mockReturnValue(now);

  it('ends a composition that starts right after the field opened, and puts the name back', () => {
    clock(1000);
    const { container } = render(<Field />);
    const input = field(container);
    input.focus();

    clock(1050);
    // The composed `ㄷ` is committed into the field when the composition is ended
    // by taking the focus away, which is what the guard does.
    input.addEventListener('blur', () => fireEvent.change(input, { target: { value: '개발ㄷ' } }), { once: true });
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    expect(input.value).toBe('개발');
    expect(document.activeElement).toBe(input);
  });

  it('selects the name afterwards, so typing replaces it as it would have on opening', () => {
    clock(1000);
    const { container } = render(<Field />);
    const input = field(container);

    clock(1050);
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('개발'.length);
  });

  it('does not count that blur as the user leaving the field', () => {
    clock(1000);
    const onBlurSeen = vi.fn();
    const { container } = render(<Field onBlurSeen={onBlurSeen} />);
    const input = field(container);
    input.focus();

    clock(1050);
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    expect(onBlurSeen).not.toHaveBeenCalled();
  });

  it('cancels a plain insertion that arrives right after the field opened', () => {
    clock(1000);
    const { container } = render(<Field />);

    clock(1050);
    const event = new InputEvent('beforeinput', { data: 'e', inputType: 'insertText', cancelable: true, bubbles: true });
    field(container).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves everything alone once the field has been open for a while', () => {
    clock(1000);
    const { container } = render(<Field />);
    const input = field(container);
    input.focus();

    clock(1000 + 5000);
    input.addEventListener('blur', () => fireEvent.change(input, { target: { value: '개발ㄷ' } }), { once: true });
    const insertion = new InputEvent('beforeinput', { data: 'e', inputType: 'insertText', cancelable: true, bubbles: true });
    input.dispatchEvent(insertion);
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    expect(insertion.defaultPrevented).toBe(false);
    expect(input.value).toBe('개발'); // never blurred, never restored: this is the user typing
    expect(document.activeElement).toBe(input);
  });

  it('still counts a real blur after the guard has finished', () => {
    clock(1000);
    const onBlurSeen = vi.fn();
    const { container } = render(<Field onBlurSeen={onBlurSeen} />);
    const input = field(container);
    input.focus();
    clock(1050);
    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    fireEvent.blur(input);

    expect(onBlurSeen).toHaveBeenCalledTimes(1);
  });
});
