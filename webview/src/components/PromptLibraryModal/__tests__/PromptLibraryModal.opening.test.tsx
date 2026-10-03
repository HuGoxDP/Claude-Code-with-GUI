import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resetPromptOrder, hydrateCategoryOrder } from '@/utils/promptOrderStore';
import type { PromptCategory, SavedPrompt } from '@/types/prompt';

const prompt = (id: string, name: string, categories?: string[]): SavedPrompt => ({
  id,
  name,
  content: `${name} body`,
  createdAt: 1,
  updatedAt: 1,
  ...(categories ? { categories } : {}),
});

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
 * The library opens on the top row of the category column, whichever row that
 * is, with that category's first prompt highlighted. With "All" dragged below the
 * categories, opening on "All" would start the user on a row they put away.
 */
describe('PromptLibraryModal: where it opens', () => {
  beforeEach(() => {
    resetPromptOrder();
    store.globalPrompts = [
      prompt('p1', 'in-docs', ['c2']),
      prompt('p2', 'in-review-second', ['c1']),
      prompt('p3', 'in-review-first', ['c1']),
    ];
    store.projectPrompts = [];
    store.categories = [
      { id: 'c1', name: 'review', createdAt: 1, priority: -1 },
      { id: 'c2', name: 'docs', createdAt: 1, priority: 1 },
    ];
    // The order a read of the backend hydrates: review, All, docs.
    hydrateCategoryOrder(['c1', '__all__', 'c2']);
  });

  const selectedRow = () => document.querySelector('[data-category-key][aria-current="true"]');

  it('opens on the first category when "All" has been moved below it', () => {
    render(<PromptLibraryModal onClose={vi.fn()} />);

    expect(selectedRow()?.getAttribute('data-category-key')).toBe('c1');
  });

  it('shows only that category\'s prompts', () => {
    render(<PromptLibraryModal onClose={vi.fn()} />);

    expect(screen.getByText('in-review-second')).toBeInTheDocument();
    expect(screen.queryByText('in-docs')).not.toBeInTheDocument();
    expect(screen.getByText('in-review-first')).toBeInTheDocument();
  });

  it('opens on "All" when it is still the top row', () => {
    hydrateCategoryOrder(['__all__', 'c1', 'c2']);
    store.categories = [
      { id: 'c1', name: 'review', createdAt: 1, priority: 1 },
      { id: 'c2', name: 'docs', createdAt: 1, priority: 2 },
    ];

    render(<PromptLibraryModal onClose={vi.fn()} />);

    expect(selectedRow()?.getAttribute('data-category-key')).toBe('__all__');
  });

  it('does not pick a row while the library is still being read', () => {
    store.loading = true;

    render(<PromptLibraryModal onClose={vi.fn()} />);

    expect(selectedRow()).toBeNull();
    store.loading = false;
  });
});
