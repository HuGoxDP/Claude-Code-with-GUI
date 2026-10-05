import { replaceRangeWithText } from '@/pages/ChatPage/ChatInput/RichInput/replaceRangeWithText';

/**
 * Where text was inserted into [before] to make [after], or null when [after] is
 * not [before] plus one run of inserted text.
 */
export function strayInsertion(before: string, after: string): { start: number; end: number } | null {
  if (before === after) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  // Anything but a pure insertion is not a stray key: leave it alone.
  return endBefore === start ? { start, end: endAfter } : null;
}

/**
 * Takes out the text a key left in the composer after a shortcut used that key.
 *
 * A shortcut key pressed under an IME also starts a composition in the composer,
 * and `preventDefault()` cannot stop it. The key's character (`ㄷ` for the key
 * that types `e`) ends up in the composer next to the `!!` it was meant to act
 * on. [before] is the composer's text when the key went down.
 *
 * Taking the focus off the composer ends a composition and commits what it had,
 * so the stray text is whole by the time it is looked for. It is removed through
 * the browser's own editing pipeline, which keeps the composer's undo history.
 */
export function dropStrayText(
  composer: HTMLElement,
  before: string,
  reportValue: (value: string) => void,
): void {
  composer.blur();
  const stray = strayInsertion(before, composer.textContent ?? '');
  if (!stray) return;
  composer.focus();
  if (!replaceRangeWithText(composer, stray.start, stray.end, '')) reportValue(before);
}
