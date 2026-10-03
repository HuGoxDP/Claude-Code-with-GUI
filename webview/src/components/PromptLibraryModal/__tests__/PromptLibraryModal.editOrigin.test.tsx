import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { resetPromptOrder } from '@/utils/promptOrderStore';
import { PROMPT_EDIT_CLOSED_EVENT } from '@/commandPalette/sections/context/items';
import type { SavedPrompt } from '@/types/prompt';

const one: SavedPrompt = { id: 'p1', name: 'one', content: 'one body', createdAt: 1, updatedAt: 1 };

const store = {
  globalPrompts: [one],
  projectPrompts: [] as SavedPrompt[],
  categories: [],
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
 * Where the edit screen goes when it is left depends on where it was reached
 * from: the `!!` panel opens it straight on a prompt, so there is no library
 * list to return to and the panel underneath is what the user comes back to.
 */
describe('PromptLibraryModal: leaving the edit screen', () => {
  const onClose = vi.fn();
  const closedHeard = vi.fn();

  beforeEach(() => {
    resetPromptOrder();
    onClose.mockClear();
    closedHeard.mockClear();
    store.update.mockClear();
    window.addEventListener(PROMPT_EDIT_CLOSED_EVENT, closedHeard);
  });
  afterEach(() => window.removeEventListener(PROMPT_EDIT_CLOSED_EVENT, closedHeard));

  const press = (key: string, code = key) => act(() => void fireEvent.keyDown(document.body, { key, code }));
  const clickCancel = () => fireEvent.click((buttons => buttons[buttons.length - 1]!)(screen.getAllByRole('button', { name: 'Cancel' })));

  describe('opened on a prompt, as the !! panel does', () => {
    const open = () => render(<PromptLibraryModal onClose={onClose} initialEdit={{ scope: 'global', prompt: one }} />);

    it('shows the edit screen straight away', () => {
      open();

      expect(screen.getByDisplayValue('one')).toBeInTheDocument();
    });

    it('closes the whole modal on Escape, with no library list in between', () => {
      open();

      press('Escape');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes the whole modal on Cancel', () => {
      open();

      clickCancel();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes the whole modal after Save', async () => {
      open();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(store.update).toHaveBeenCalled());
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('tells the panel it came from that the editor is gone, however it went', () => {
      const { unmount } = open();
      expect(closedHeard).not.toHaveBeenCalled();

      unmount();

      expect(closedHeard).toHaveBeenCalledTimes(1);
    });
  });

  describe('opened from inside the library', () => {
    const open = () => render(<PromptLibraryModal onClose={onClose} />);
    const editFirst = () => press('e', 'KeyE');

    it('goes back to the library list on Escape, which stays open', () => {
      open();
      editFirst();
      expect(screen.getByDisplayValue('one')).toBeInTheDocument();

      press('Escape');

      expect(screen.getByText('Global Prompts')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('goes back to the library list on Cancel', () => {
      open();
      editFirst();

      clickCancel();

      expect(screen.getByText('Global Prompts')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('goes back to the library list after Save', async () => {
      open();
      editFirst();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.getByText('Global Prompts')).toBeInTheDocument());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not announce an editor closing: the user never left the library', () => {
      const { unmount } = open();
      editFirst();

      unmount();

      expect(closedHeard).not.toHaveBeenCalled();
    });
  });
});
