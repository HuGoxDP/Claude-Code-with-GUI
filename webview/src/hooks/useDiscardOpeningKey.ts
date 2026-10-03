import { useEffect, useRef, type RefObject } from 'react';

/**
 * How long after a field appears that text arriving in it still counts as the
 * keystroke that opened it. A person cannot type a second character that fast.
 */
const OPENING_WINDOW_MS = 300;

/**
 * Keeps the key that opened a text field out of the field.
 *
 * A shortcut like `e` opens a field and moves the focus into it in the same
 * keystroke. Under a Korean (or other) IME the keystroke is then delivered to
 * whatever has the focus AFTER the key handler ran, and `preventDefault()` on
 * the keydown cannot stop it: the IME has already taken the key. The result is
 * a field that opens with `ㄷ` typed into it instead of the name it was meant to
 * show.
 *
 * So for a moment after the field appears, text that arrives in it is the
 * opening key and not the user typing:
 *
 * - A plain insertion is cancelled before it lands.
 * - A composition cannot be cancelled, only ended. It is ended by taking the
 *   focus away and giving it back, and [restore] puts the original text back
 *   (and the caller keeps its blur handler out of the way, see the returned ref).
 *
 * [resetKey] says when a field is a new one: the element may stay mounted while
 * what it edits changes. Answers a ref that is true while the guard is working,
 * so a blur handler can tell this blur from the user leaving the field.
 */
export function useDiscardOpeningKey(
  ref: RefObject<HTMLInputElement | null>,
  resetKey: unknown,
  restore: () => void,
): RefObject<boolean> {
  const discarding = useRef(false);
  const latestRestore = useRef(restore);
  latestRestore.current = restore;

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const openedAt = performance.now();
    const justOpened = () => performance.now() - openedAt < OPENING_WINDOW_MS;

    const onBeforeInput = (event: Event) => {
      if (justOpened() && event.cancelable) event.preventDefault();
    };
    const onCompositionStart = () => {
      if (!justOpened()) return;
      discarding.current = true;
      try {
        field.blur(); // ends the composition, committing what it had
        latestRestore.current(); // and the committed text is taken back out
        field.focus();
        field.select();
      } finally {
        discarding.current = false;
      }
    };

    field.addEventListener('beforeinput', onBeforeInput);
    field.addEventListener('compositionstart', onCompositionStart);
    return () => {
      field.removeEventListener('beforeinput', onBeforeInput);
      field.removeEventListener('compositionstart', onCompositionStart);
    };
  }, [ref, resetKey]);

  return discarding;
}
