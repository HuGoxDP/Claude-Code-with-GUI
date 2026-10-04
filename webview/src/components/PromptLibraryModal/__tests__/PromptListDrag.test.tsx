import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PromptList } from '../PromptList';
import { PROMPT_NO_DRAG_ATTRIBUTE } from '@/utils/promptDrag';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (id: string, name: string): SavedPrompt => ({
  id,
  name,
  content: `${name} body`,
  createdAt: 1,
  updatedAt: 1,
});

function renderList() {
  return render(
    <PromptList
      globalPrompts={[prompt('g1', 'first'), prompt('g2', 'second')]}
      projectPrompts={[]}
      projectAvailable
      workingDirectory="/work"
      selectedId="g1"
      isFocusedPane
      onUse={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

const cardFor = (id: string) => document.querySelector<HTMLElement>(`[data-prompt-id="${id}"]`);

/**
 * The card used to carry a bookmark icon as its drag handle. The whole card is
 * the handle now, so the icon has nothing left to say and the card's own
 * controls are what has to be kept out of the drag.
 */
describe('a prompt card as a drag handle', () => {
  it('has no separate handle icon', () => {
    renderList();

    // The only icons left on the card are edit and delete, both inside buttons.
    const icons = Array.from(cardFor('g1')?.querySelectorAll('svg') ?? []);
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.closest('button')).not.toBeNull();
    }
  });

  it('marks edit and delete, and only those, as controls that must not start a drag', () => {
    renderList();

    const marked = cardFor('g1')?.querySelector(`[${PROMPT_NO_DRAG_ATTRIBUTE}]`);
    expect(marked).not.toBeNull();
    expect(marked?.querySelectorAll('button')).toHaveLength(2);
  });

  it('leaves the card body outside the no-drag area, so pressing it can start a drag', () => {
    renderList();

    const body = cardFor('g1')?.querySelector('button');
    expect(body?.closest(`[${PROMPT_NO_DRAG_ATTRIBUTE}]`)).toBeNull();
  });
});
