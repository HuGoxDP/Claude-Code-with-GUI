import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { resetPromptOrder } from '@/utils/promptOrderStore';
import type { PromptCategory, SavedPrompt } from '@/types/prompt';

const prompt = (id: string, name: string, categories?: string[]): SavedPrompt => ({
  id,
  name,
  content: `${name} body`,
  createdAt: 1,
  updatedAt: 1,
  ...(categories ? { categories } : {}),
});
const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });

const store = {
  globalPrompts: [] as SavedPrompt[],
  projectPrompts: [] as SavedPrompt[],
  categories: [] as PromptCategory[],
  loading: false,
  error: null as string | null,
  projectAvailable: false,
  reload: vi.fn(),
  create: vi.fn(async () => {}),
  update: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  createCategory: vi.fn(async () => ({})),
  renameCategory: vi.fn(async () => ({})),
  deleteCategory: vi.fn(async () => ({})),
  exportPrompts: vi.fn(),
  previewImport: vi.fn(),
  importPrompts: vi.fn(),
};

vi.mock('../usePromptStore', () => ({ usePromptStore: () => store }));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: null }) }));
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: true, send: vi.fn(), subscribe: vi.fn(() => vi.fn()), lastError: null }),
}));

import { PromptLibraryModal } from '../index';

/**
 * The composer reads Escape in the bubble phase and stops the stream with it.
 * A modal that lets Escape through to it is a modal that interrupts a response.
 */
const composerSawEscape = vi.fn();
const confirmDelete = () =>
  fireEvent.click(
    within(screen.getByTestId('confirm-dialog-backdrop')).getByRole('button', { name: 'Delete' }),
  );

const press = (init: KeyboardEventInit, target: Element | Window = document.body) =>
  act(() => {
    fireEvent.keyDown(target, init);
  });
const pressKey = (key: string, code = '') => {
  press({ key, code, bubbles: true });
  // The `e` key opens its edit when it is let go, not when it goes down.
  if (code === 'KeyE') act(() => void fireEvent.keyUp(document.body, { key, code, bubbles: true }));
};

describe('PromptLibraryModal keyboard', () => {
  let onClose: () => void;
  let composer: (e: KeyboardEvent) => void;

  beforeEach(() => {
    resetPromptOrder();
    store.globalPrompts = [prompt('p1', 'one', ['c1']), prompt('p2', 'two'), prompt('p3', 'three')];
    store.projectPrompts = [];
    store.categories = [category('c1', 'review'), category('c2', 'docs')];
    for (const fn of [store.remove, store.renameCategory, store.deleteCategory, store.update]) fn.mockClear();
    composerSawEscape.mockClear();
    onClose = vi.fn() as unknown as () => void;
    composer = (e) => {
      if (e.key === 'Escape') composerSawEscape();
    };
    // Registered BEFORE the modal, which is the order that let a bubble-phase
    // modal lose the race to the composer.
    window.addEventListener('keydown', composer);
    render(<PromptLibraryModal onClose={onClose} />);
  });

  afterEach(() => {
    window.removeEventListener('keydown', composer);
  });

  const nameField = () => screen.queryByDisplayValue('one');

  describe('editing a prompt', () => {
    it('opens the edit screen on the highlighted prompt with the letter e', () => {
      pressKey('e', 'KeyE');

      expect(nameField()).toBeInTheDocument();
    });

    it('does the same under another layout, where the same key types a different letter', () => {
      pressKey('ㄷ', 'KeyE');

      expect(nameField()).toBeInTheDocument();
    });

    it('opens the edit screen with the right arrow', () => {
      pressKey('ArrowRight', 'ArrowRight');

      expect(nameField()).toBeInTheDocument();
    });

    it('edits the prompt the highlight is on, not the first one', () => {
      pressKey('ArrowDown', 'ArrowDown');
      pressKey('e', 'KeyE');

      expect(screen.getByDisplayValue('two')).toBeInTheDocument();
    });

    it('leaves the letter alone while the search box has the focus', () => {
      const search = screen.getByRole('textbox');
      search.focus();

      press({ key: 'e', code: 'KeyE', bubbles: true }, search);

      expect(nameField()).not.toBeInTheDocument();
    });

    it('takes the focus out of the search box on the down arrow, so the next e is an edit', () => {
      const search = screen.getByRole('textbox');
      search.focus();
      press({ key: 'ArrowDown', code: 'ArrowDown', bubbles: true }, search);

      pressKey('e', 'KeyE');

      expect(screen.getByDisplayValue('two')).toBeInTheDocument();
    });

    it('ignores e with a modifier held, which is a different shortcut', () => {
      press({ key: 'e', code: 'KeyE', metaKey: true, bubbles: true });
      press({ key: 'e', code: 'KeyE', ctrlKey: true, bubbles: true });

      expect(nameField()).not.toBeInTheDocument();
    });
  });

  // Edit mode is entered on the key coming UP. Under an IME the key going down is
  // also the start of a composition, whose text (`ㄷ` on a Korean layout) lands in
  // whatever has the focus once the key handler returns; moving the focus into a
  // field on the keydown typed the key into the field it had just opened.
  describe('the e key opens an edit when it is let go', () => {
    const down = () => press({ key: 'ㄷ', code: 'KeyE', bubbles: true, cancelable: true });
    const up = () => act(() => void fireEvent.keyUp(document.body, { key: 'ㄷ', code: 'KeyE', bubbles: true, cancelable: true }));

    it('opens nothing while the key is still down', () => {
      down();

      expect(nameField()).not.toBeInTheDocument();
    });

    it('opens the edit screen when the key comes up', () => {
      down();
      up();

      expect(nameField()).toBeInTheDocument();
    });

    it('keeps the key down from being typed anywhere', () => {
      const event = new KeyboardEvent('keydown', { key: 'ㄷ', code: 'KeyE', bubbles: true, cancelable: true });

      act(() => void document.body.dispatchEvent(event));

      expect(event.defaultPrevented).toBe(true);
    });

    it('keeps the key coming up from reaching anything else', () => {
      down();
      const event = new KeyboardEvent('keyup', { key: 'ㄷ', code: 'KeyE', bubbles: true, cancelable: true });
      const heard = vi.fn();
      document.addEventListener('keyup', heard);

      act(() => void document.body.dispatchEvent(event));
      document.removeEventListener('keyup', heard);

      expect(event.defaultPrevented).toBe(true);
      expect(heard).not.toHaveBeenCalled();
    });

    it('does nothing for a key that comes up without having gone down on a row', () => {
      up();

      expect(nameField()).not.toBeInTheDocument();
    });

    it('swallows the repeats of a held key and opens once', () => {
      down();
      const repeat = new KeyboardEvent('keydown', { key: 'ㄷ', code: 'KeyE', repeat: true, bubbles: true, cancelable: true });
      act(() => void document.body.dispatchEvent(repeat));
      up();

      expect(repeat.defaultPrevented).toBe(true);
      expect(nameField()).toBeInTheDocument();
    });

    it('opens a category\'s name field the same way, and only on the way up', () => {
      pressKey('ArrowLeft', 'ArrowLeft');
      pressKey('ArrowDown', 'ArrowDown');

      down();
      expect(screen.queryByDisplayValue('review')).not.toBeInTheDocument();
      up();

      expect(screen.getByDisplayValue('review')).toBeInTheDocument();
    });
  });

  describe('leaving a category\'s edit mode', () => {
    const intoEdit = () => {
      pressKey('ArrowLeft', 'ArrowLeft');
      pressKey('ArrowDown', 'ArrowDown');
      pressKey('e', 'KeyE');
    };

    // The field used to take Escape itself, so Escape did nothing whenever the
    // focus was not in it (or an IME syllable was half done).
    it('works from wherever the focus is, not only from inside the field', () => {
      intoEdit();
      (document.activeElement as HTMLElement | null)?.blur();
      expect(screen.getByDisplayValue('review')).toBeInTheDocument();

      pressKey('Escape', 'Escape');

      expect(screen.queryByDisplayValue('review')).not.toBeInTheDocument();
      expect(screen.getByText('review')).toBeInTheDocument();
      expect(store.renameCategory).not.toHaveBeenCalled();
      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
      expect(composerSawEscape).not.toHaveBeenCalled();
    });

    it('works while an IME syllable is half done in the field', () => {
      intoEdit();
      const field = screen.getByDisplayValue('review');
      fireEvent.compositionStart(field);

      fireEvent.keyDown(field, { key: 'Escape', code: 'Escape', keyCode: 229 });

      expect(screen.queryByDisplayValue('review')).not.toBeInTheDocument();
      expect(store.renameCategory).not.toHaveBeenCalled();
    });
  });

  describe('deleting a prompt', () => {
    it('asks first, and deletes nothing yet', () => {
      pressKey('Backspace', 'Backspace');

      expect(screen.getByTestId('confirm-dialog-backdrop')).toBeInTheDocument();
      expect(store.remove).not.toHaveBeenCalled();
    });

    it('closes the question with Escape and deletes nothing', () => {
      pressKey('Backspace', 'Backspace');

      pressKey('Escape', 'Escape');

      expect(screen.queryByTestId('confirm-dialog-backdrop')).not.toBeInTheDocument();
      expect(store.remove).not.toHaveBeenCalled();
    });

    it('answers Escape with the question only: the library stays open and the composer never hears it', () => {
      pressKey('Backspace', 'Backspace');

      pressKey('Escape', 'Escape');

      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
      expect(screen.getByText('Prompt Library')).toBeInTheDocument();
      expect(composerSawEscape).not.toHaveBeenCalled();
    });

    it('deletes exactly the highlighted prompt once confirmed, and the library stays open', async () => {
      pressKey('ArrowDown', 'ArrowDown');
      pressKey('Backspace', 'Backspace');

      confirmDelete();

      await waitFor(() => expect(store.remove).toHaveBeenCalledWith('global', 'p2'));
      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it('does not delete while the search box has the focus', () => {
      const search = screen.getByRole('textbox');
      search.focus();

      press({ key: 'Backspace', code: 'Backspace', bubbles: true }, search);

      expect(screen.queryByTestId('confirm-dialog-backdrop')).not.toBeInTheDocument();
    });
  });

  describe('editing a category', () => {
    const intoCategories = () => {
      pressKey('ArrowLeft', 'ArrowLeft');
      pressKey('ArrowDown', 'ArrowDown'); // all -> review
    };

    it('puts the highlighted category into edit mode with e', () => {
      intoCategories();

      pressKey('e', 'KeyE');

      expect(screen.getByDisplayValue('review')).toBeInTheDocument();
    });

    it('does not edit with the right arrow: it crosses into that category\'s prompts', () => {
      intoCategories();

      pressKey('ArrowRight', 'ArrowRight');

      expect(screen.queryByDisplayValue('review')).not.toBeInTheDocument();
      // Now in the prompts, where Right edits the highlighted prompt.
      pressKey('ArrowRight', 'ArrowRight');
      expect(nameField()).toBeInTheDocument();
    });

    it('edits under another layout too', () => {
      intoCategories();

      pressKey('ㄷ', 'KeyE');

      expect(screen.getByDisplayValue('review')).toBeInTheDocument();
    });

    it('saves the new name with Enter', async () => {
      intoCategories();
      pressKey('e', 'KeyE');
      const field = screen.getByDisplayValue('review');

      fireEvent.change(field, { target: { value: 'reviews' } });
      fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });

      await waitFor(() => expect(store.renameCategory).toHaveBeenCalledWith('c1', 'reviews'));
    });

    it('puts the old name back with Escape, saving nothing', () => {
      intoCategories();
      pressKey('e', 'KeyE');
      const field = screen.getByDisplayValue('review');
      fireEvent.change(field, { target: { value: 'something else' } });

      fireEvent.keyDown(field, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByDisplayValue('something else')).not.toBeInTheDocument();
      expect(screen.getByText('review')).toBeInTheDocument();
      expect(store.renameCategory).not.toHaveBeenCalled();
    });

    it('answers Escape in edit mode with the edit only: the library stays and the composer never hears it', () => {
      intoCategories();
      pressKey('e', 'KeyE');
      const field = screen.getByDisplayValue('review');

      fireEvent.keyDown(field, { key: 'Escape', code: 'Escape' });

      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
      expect(composerSawEscape).not.toHaveBeenCalled();
    });

    it('does not edit "All", which is not a category, and Right still crosses into the lists', () => {
      pressKey('ArrowLeft', 'ArrowLeft');

      pressKey('e', 'KeyE');
      pressKey('ArrowRight', 'ArrowRight');

      expect(screen.queryByDisplayValue('All')).not.toBeInTheDocument();
      // Back in the lists, the next Right is an edit of the highlighted prompt.
      pressKey('ArrowRight', 'ArrowRight');
      expect(nameField()).toBeInTheDocument();
    });

  });

  describe('deleting a category', () => {
    const intoCategories = () => {
      pressKey('ArrowLeft', 'ArrowLeft');
      pressKey('ArrowDown', 'ArrowDown');
    };

    it('asks first, then deletes only that category and leaves the library open', async () => {
      intoCategories();
      pressKey('Backspace', 'Backspace');
      expect(store.deleteCategory).not.toHaveBeenCalled();

      confirmDelete();

      await waitFor(() => expect(store.deleteCategory).toHaveBeenCalledWith('c1'));
      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it('deletes nothing when Escape closes the question', () => {
      intoCategories();
      pressKey('Backspace', 'Backspace');

      pressKey('Escape', 'Escape');

      expect(store.deleteCategory).not.toHaveBeenCalled();
      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
      expect(composerSawEscape).not.toHaveBeenCalled();
    });

    it('does not offer to delete "All"', () => {
      pressKey('ArrowLeft', 'ArrowLeft');

      pressKey('Backspace', 'Backspace');

      expect(screen.queryByTestId('confirm-dialog-backdrop')).not.toBeInTheDocument();
    });
  });

  describe('Escape', () => {
    it('closes the library and keeps the key from the composer', () => {
      pressKey('Escape', 'Escape');

      expect(onClose as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
      expect(composerSawEscape).not.toHaveBeenCalled();
    });

    it('leaves the edit screen for the list, without closing the library or stopping anything', () => {
      pressKey('e', 'KeyE');
      expect(nameField()).toBeInTheDocument();

      pressKey('Escape', 'Escape');

      expect(nameField()).not.toBeInTheDocument();
      expect(onClose as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
      expect(composerSawEscape).not.toHaveBeenCalled();
    });
  });
});
