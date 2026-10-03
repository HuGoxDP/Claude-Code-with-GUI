import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PromptDropdown } from '../PromptDropdown';
import { ALL_CATEGORIES } from '@/utils/promptCategories';
import { PROMPT_NO_DRAG_ATTRIBUTE } from '@/utils/promptDrag';
import { resetPromptOrder, updatePromptOrder } from '@/utils/promptOrderStore';
import type { PanelCategoryRow, PromptRow } from '../hooks/usePromptLibrary';

// jsdom does not implement scrollIntoView; PromptDropdown calls it to keep the
// selected row visible on selectedIndex change.
Element.prototype.scrollIntoView = vi.fn();

/** The row element a prompt is drawn in: a <li>'s only child. */
const promptRow = (name: string) => screen.getByText(name).closest('li')?.firstElementChild;

const row = (id: string, name: string, content: string, scope: 'global' | 'project'): PromptRow => ({
  kind: 'prompt',
  prompt: { id, name, content, scope, createdAt: 1, updatedAt: 1 },
});

function renderPanel(rows: PromptRow[], overrides: Partial<React.ComponentProps<typeof PromptDropdown>> = {}) {
  return render(
    <PromptDropdown
      rows={rows}
      selectedIndex={0}
      isLoading={false}
      hasLoaded
      categoryRows={[]}
      selectedCategory={ALL_CATEGORIES}
      focusedPane="prompts"
      onSelectCategory={vi.fn()}
      onFilePrompt={vi.fn()}
      onSelect={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe('PromptDropdown', () => {
  beforeEach(() => {
    // The arranged order is shared with the library modal and outlives a render.
    resetPromptOrder();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the name and a one-line preview', () => {
    renderPanel([row('p1', '시작', '워크트리 따서 작업 착수하자.\n다음 마일스톤으로 설정해.', 'project')]);

    expect(screen.getByText('시작')).toBeInTheDocument();
    // The preview collapses the line break so the row stays one line tall.
    expect(
      screen.getByText('워크트리 따서 작업 착수하자. 다음 마일스톤으로 설정해.'),
    ).toBeInTheDocument();
  });

  /**
   * Issue #430 — the preview and the scope were on `text-disabled`, the dimmest
   * token in the palette (82/255 in the dark theme), and could not be read at a
   * glance. The name carries the hierarchy by weight instead, so these two can
   * stay legible.
   */
  describe('legibility of the secondary text', () => {
    it('keeps every part of the row off the dimmest token', () => {
      renderPanel([row('p1', '시작', '본문', 'global')]);

      expect(document.querySelectorAll('.text-text-disabled').length).toBe(0);
    });

    it('carries the name hierarchy by weight rather than by dimming its neighbours', () => {
      renderPanel([row('p1', '시작', '본문', 'global')]);

      expect(screen.getByText('시작').className).toContain('font-medium');
    });
  });

  /**
   * The name exists to tell prompts apart at a glance; the content is the thing
   * being pasted, so the content gets the room. They used to split the row
   * evenly, which left the content truncated while the name had space to spare.
   *
   * Asserted on the classes because jsdom lays nothing out — every width it
   * reports is 0 — and the class is what the contract is written in. The real
   * split was measured in a browser: 24.1% name, 63.5% content.
   */
  describe('the row gives the content the room', () => {
    it('caps the name at a quarter of the row instead of letting it grow', () => {
      renderPanel([row('p1', '아주 긴 이름을 가진 프롬프트', '본문', 'global')]);

      const name = screen.getByText('아주 긴 이름을 가진 프롬프트');
      expect(name.className).toContain('w-1/4');
      expect(name.className).toContain('flex-shrink-0');
      expect(name.className).not.toContain('flex-1');
    });

    it('lets the content take the remaining room', () => {
      renderPanel([row('p1', '시작', '본문', 'global')]);

      const previewText = screen.getByText('본문');
      expect(previewText.className).toContain('flex-1');
    });
  });

  /**
   * A truncated line cannot tell the user what they are about to paste, so
   * hovering the preview offers the whole prompt, line breaks and all.
   *
   * The hover is driven for real (mouseenter plus Tippy's open delay) rather
   * than asserting on a closed tooltip's DOM: measured here, Tippy headless does
   * NOT commit its `render` while closed, so "the content is in the document"
   * would pass for the wrong reason — or, as it did first, fail for one.
   */
  describe('the preview offers the whole prompt on hover', () => {
    it('shows the content unedited, newlines included', () => {
      vi.useFakeTimers();
      const content = '첫 줄\n둘째 줄';
      renderPanel([row('p1', '시작', content, 'global')]);

      // Nothing is shown before the pointer arrives.
      expect(document.querySelector('.whitespace-pre-wrap')).toBeNull();

      const preview = screen.getByText('첫 줄 둘째 줄');
      act(() => {
        fireEvent.mouseEnter(preview);
        vi.advanceTimersByTime(500); // past Tippy's 200ms open delay
      });

      const body = document.querySelector('.whitespace-pre-wrap');
      expect(body).not.toBeNull();
      expect(body?.textContent).toBe(content);
    });
  });

  /**
   * The row is itself a <button>, so its two actions are spans with a button
   * role. mousedown rather than click, because the composer's blur must not fire
   * first — the same reason the row uses mousedown to select.
   */
  describe('a row can be edited and deleted from the panel', () => {
    it('names the prompt to edit and does not also select it', () => {
      const onEdit = vi.fn();
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'global')], { onEdit, onSelect });

      fireEvent.mouseDown(screen.getByRole('button', { name: 'Edit' }));

      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', scope: 'global' }),
      );
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('names the prompt to delete and does not also select it', () => {
      const onDelete = vi.fn();
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'project')], { onDelete, onSelect });

      fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', scope: 'project' }),
      );
      expect(onSelect).not.toHaveBeenCalled();
    });

    // The create row has no prompt behind it, so it has nothing to edit.
    it('offers neither on the create row', () => {
      renderPanel([{ kind: 'create' }]);
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });
  });

  /**
   * The whole row is the drag handle. A press has to stay undecided between
   * "pick this prompt" and "start dragging it" until the pointer has travelled or
   * been released, so picking cannot happen on the press itself. It used to, and
   * a press meant to start a drag pasted the prompt and closed the panel first.
   */
  describe('pressing a row, which might be the start of a drag', () => {
    const body = () => screen.getByText('시작').closest('button') as HTMLElement;

    it('does not pick the prompt on the press', () => {
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'global')], { onSelect });

      fireEvent.mouseDown(body());

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('picks the prompt when the press is released as a click', () => {
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'global')], { onSelect });

      fireEvent.click(body());

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(0);
    });

    // Letting the press through would blur the composer before the click landed,
    // which is the reason this row ever used mousedown at all.
    it('keeps focus in the composer by cancelling the press default', () => {
      renderPanel([row('p1', '시작', 'body', 'global')]);

      // fireEvent returns false when a handler called preventDefault.
      expect(fireEvent.mouseDown(body())).toBe(false);
    });

    it('has no separate handle icon, because the row itself is the handle', () => {
      renderPanel([row('p1', '시작', 'body', 'global')]);

      // The only icons left are edit and delete, both inside buttons.
      const icons = Array.from(promptRow('시작')?.querySelectorAll('svg') ?? []);
      expect(icons).toHaveLength(2);
      for (const icon of icons) expect(icon.closest('button')).not.toBeNull();
    });

    it('shows the grab cursor over the whole row, including its body', () => {
      renderPanel([row('p1', '시작', 'body', 'global')]);

      expect(promptRow('시작')?.className).toContain('cursor-grab');
      // The body is a button, which would otherwise show its own cursor.
      expect(body().className).toContain('cursor-[inherit]');
    });

    it('keeps edit and delete out of the drag, and the body in it', () => {
      renderPanel([row('p1', '시작', 'body', 'global')]);

      expect(
        screen.getByRole('button', { name: 'Edit' }).closest(`[${PROMPT_NO_DRAG_ATTRIBUTE}]`),
      ).not.toBeNull();
      expect(
        screen.getByRole('button', { name: 'Delete' }).closest(`[${PROMPT_NO_DRAG_ATTRIBUTE}]`),
      ).not.toBeNull();
      expect(body().closest(`[${PROMPT_NO_DRAG_ATTRIBUTE}]`)).toBeNull();
    });
  });

  /**
   * The category column, which the library modal also has. Rendering it only
   * when there is something to pick keeps the panel unchanged for everyone who
   * never filed a prompt under anything.
   */
  describe('the category column', () => {
    const categoryRows: PanelCategoryRow[] = [
      { key: ALL_CATEGORIES, category: null, count: 3 },
      { key: 'c1', category: { id: 'c1', name: '리뷰', createdAt: 1 }, count: 2 },
    ];

    it('is not drawn at all when no categories exist', () => {
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows: [] });

      expect(screen.queryByRole('button', { name: /All/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /리뷰/ })).toBeNull();
    });

    it('names each category with how many prompts are behind it', () => {
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows });

      expect(screen.getByRole('button', { name: '리뷰 (2)' })).toBeInTheDocument();
    });

    it('reports the picked category rather than selecting a prompt', () => {
      const onSelectCategory = vi.fn();
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'global')], {
        categoryRows,
        onSelectCategory,
        onSelect,
      });

      // Selecting happens when the press is released as a click, not on the
      // press itself: a press on a chip may turn out to be the start of a drag.
      fireEvent.click(screen.getByRole('button', { name: '리뷰 (2)' }));

      expect(onSelectCategory).toHaveBeenCalledWith('c1');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('does not select a category on the press, which might be the start of a drag', () => {
      const onSelectCategory = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows, onSelectCategory });

      fireEvent.mouseDown(screen.getByRole('button', { name: '리뷰 (2)' }));

      expect(onSelectCategory).not.toHaveBeenCalled();
    });

    it('keeps focus in the composer by cancelling the press default', () => {
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows });

      expect(fireEvent.mouseDown(screen.getByRole('button', { name: '리뷰 (2)' }))).toBe(false);
    });

    // The drag layer owns `aria-pressed` on anything it can pick up, so the
    // selected category has to be announced some other way.
    it('announces the picked chip with aria-current', () => {
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows, selectedCategory: 'c1' });

      expect(screen.getByRole('button', { name: '리뷰 (2)' })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: /All/ })).not.toHaveAttribute('aria-current');
    });

    it('shows the grab hand on a real category chip and not on "All"', () => {
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows });

      expect(screen.getByRole('button', { name: '리뷰 (2)' }).className).toContain('cursor-grab');
      expect(screen.getByRole('button', { name: /All/ }).className).not.toContain('cursor-grab');
    });

    // The column the user arranged is the column drawn, with "All" still first.
    it('draws the chips in the order the user arranged them', () => {
      const three: PanelCategoryRow[] = [
        { key: ALL_CATEGORIES, category: null, count: 3 },
        { key: 'c2', category: { id: 'c2', name: '문서', createdAt: 1 }, count: 1 },
        { key: 'c1', category: { id: 'c1', name: '리뷰', createdAt: 1 }, count: 2 },
      ];
      renderPanel([row('p1', '시작', 'body', 'global')], { categoryRows: three });

      const names = Array.from(document.querySelectorAll('button[title]'))
        .map((button) => button.getAttribute('title'))
        .filter((title) => title === '문서' || title === '리뷰' || title?.startsWith('All'));

      expect(names).toEqual(['All', '문서', '리뷰']);
    });

    /**
     * Both columns hold a highlight at once, so the highlight alone cannot say
     * which one Up and Down would move. The focused column's selected row is
     * ringed and the other one's is not.
     */
    it('rings the selected row of whichever column the arrows are walking', () => {
      const { rerender } = renderPanel([row('p1', '시작', 'body', 'global')], {
        categoryRows,
        selectedCategory: 'c1',
        focusedPane: 'categories',
      });

      expect(screen.getByRole('button', { name: '리뷰 (2)' }).className).toContain('ring-1');
      expect(promptRow('시작')?.className).not.toContain('ring-1');

      rerender(
        <PromptDropdown
          rows={[row('p1', '시작', 'body', 'global')]}
          selectedIndex={0}
          isLoading={false}
          hasLoaded
          categoryRows={categoryRows}
          selectedCategory="c1"
          focusedPane="prompts"
          onSelectCategory={vi.fn()}
          onFilePrompt={vi.fn()}
          onSelect={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: '리뷰 (2)' }).className).not.toContain('ring-1');
      expect(promptRow('시작')?.className).toContain('ring-1');
    });
  });

  /**
   * The order the user dragged the prompts into is shared with the library
   * modal. Arranging the library and then finding the panel in the old order
   * would read as the drag not having worked.
   */
  describe('the order the user arranged', () => {
    const drawnNames = () =>
      Array.from(document.querySelectorAll('ul li')).map(
        (li) => li.querySelector('span.font-medium')?.textContent ?? 'create',
      );

    it('draws prompts in the arranged order, project before global, create last', () => {
      act(() => {
        updatePromptOrder(() => ({ global: ['g2', 'g1'], project: ['p2', 'p1'] }));
      });

      renderPanel([
        row('p1', 'P1', 'body', 'project'),
        row('p2', 'P2', 'body', 'project'),
        row('g1', 'G1', 'body', 'global'),
        row('g2', 'G2', 'body', 'global'),
        { kind: 'create' },
      ]);

      expect(drawnNames()).toEqual(['P2', 'P1', 'G2', 'G1', 'create']);
    });

    it('draws a prompt nobody has placed yet at the top of its own scope', () => {
      act(() => {
        updatePromptOrder(() => ({ global: ['g1'], project: [] }));
      });

      renderPanel([row('g1', 'G1', 'body', 'global'), row('gNew', 'GNEW', 'body', 'global')]);

      expect(drawnNames()).toEqual(['GNEW', 'G1']);
    });

    // A row is addressed by its place in `rows`, not by where it is drawn, so
    // picking a row that was dragged elsewhere must still pick that prompt.
    it('picks the prompt that was clicked even when it is drawn out of order', () => {
      act(() => {
        updatePromptOrder(() => ({ global: ['g2', 'g1'], project: [] }));
      });
      const onSelect = vi.fn();
      renderPanel([row('g1', 'G1', 'body', 'global'), row('g2', 'G2', 'body', 'global')], {
        onSelect,
      });

      fireEvent.click(screen.getByText('G2').closest('button') as HTMLElement);

      // G2 is the second entry of the rows the panel was given.
      expect(onSelect).toHaveBeenCalledWith(1);
    });
  });
});


describe('PromptDropdown category name editing', () => {
  const category = { id: 'c1', name: 'review', createdAt: 1 };
  const categoryRows: PanelCategoryRow[] = [
    { key: ALL_CATEGORIES, category: null, count: 2 },
    { key: 'c1', category, count: 1 },
  ];
  const prompts = [row('p1', 'one', 'one body', 'global')];

  beforeEach(() => {
    resetPromptOrder();
  });

  const edit = (overrides: Partial<React.ComponentProps<typeof PromptDropdown>> = {}) =>
    renderPanel(prompts, {
      categoryRows,
      editingCategory: 'c1',
      onRenameCategory: vi.fn(),
      onCancelCategoryEdit: vi.fn(),
      ...overrides,
    });

  it('shows the name in a field, selected, in place of the chip', () => {
    edit();

    const field = screen.getByDisplayValue('review') as HTMLInputElement;
    expect(field).toBeInTheDocument();
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe('review'.length);
  });

  it('shows ordinary chips when nothing is being edited', () => {
    renderPanel(prompts, { categoryRows, editingCategory: null });

    expect(screen.queryByDisplayValue('review')).not.toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
  });

  it('saves the typed name with Enter', () => {
    const onRenameCategory = vi.fn();
    edit({ onRenameCategory });
    const field = screen.getByDisplayValue('review');

    fireEvent.change(field, { target: { value: 'reviews' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onRenameCategory).toHaveBeenCalledWith('c1', 'reviews');
  });

  it('puts the old name back with Escape, and saves nothing', () => {
    const onRenameCategory = vi.fn();
    const onCancelCategoryEdit = vi.fn();
    edit({ onRenameCategory, onCancelCategoryEdit });
    const field = screen.getByDisplayValue('review');
    fireEvent.change(field, { target: { value: 'something else' } });

    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field); // the trailing blur an unmounting field can fire

    expect(onCancelCategoryEdit).toHaveBeenCalledTimes(1);
    expect(onRenameCategory).not.toHaveBeenCalled();
  });

  it('keeps Escape and every other key from travelling on to the composer', () => {
    edit();
    const field = screen.getByDisplayValue('review');
    const heard = vi.fn();
    document.addEventListener('keydown', heard);

    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(field, { key: 'x' });
    document.removeEventListener('keydown', heard);

    expect(heard).not.toHaveBeenCalled();
  });

  it('saves when the field loses the focus, once', () => {
    const onRenameCategory = vi.fn();
    edit({ onRenameCategory });
    const field = screen.getByDisplayValue('review');

    fireEvent.change(field, { target: { value: 'reviews' } });
    fireEvent.blur(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onRenameCategory).toHaveBeenCalledTimes(1);
  });
});
