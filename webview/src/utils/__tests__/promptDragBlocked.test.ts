import { describe, it, expect } from 'vitest';
import { PROMPT_NO_DRAG_ATTRIBUTE, isPromptDragBlocked } from '../promptDrag';

function element(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

/**
 * The whole card is the drag handle, so the only protection a control on it has
 * is this check. Without it a press on edit or delete would be read as the start
 * of a drag.
 */
describe('isPromptDragBlocked', () => {
  const card = element(
    `<div><button id="body">use</button>` +
      `<span ${PROMPT_NO_DRAG_ATTRIBUTE}><button id="edit"><svg id="icon"></svg></button></span></div>`,
  );

  it('blocks a press on a marked control', () => {
    expect(isPromptDragBlocked(card.querySelector('#edit'))).toBe(true);
  });

  // The pointer lands on the icon inside the button, not on the button itself.
  it('blocks a press on something inside a marked control', () => {
    expect(isPromptDragBlocked(card.querySelector('#icon'))).toBe(true);
  });

  // The card body is a button too, and it must still start a drag.
  it('lets a press on the card body through', () => {
    expect(isPromptDragBlocked(card.querySelector('#body'))).toBe(false);
  });

  it('lets a press with no element behind it through', () => {
    expect(isPromptDragBlocked(null)).toBe(false);
  });
});
