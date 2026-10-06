import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstructionsPicker } from '../index';
import type { SavedPrompt } from '@/types/prompt';

const prompts: SavedPrompt[] = [
  { id: 'p-1', name: 'Reviewer', content: 'Review like a senior engineer.', createdAt: 1, updatedAt: 1 },
  { id: 'p-2', name: 'Haiku', content: 'Answer in haiku.', createdAt: 1, updatedAt: 1 },
];

function renderPicker(over: Partial<Parameters<typeof InstructionsPicker>[0]> = {}) {
  const props = {
    prompts,
    loading: false,
    error: null,
    selectedId: null,
    onPick: vi.fn(),
    onClear: vi.fn(),
    onOpenLibrary: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  render(<InstructionsPicker {...props} />);
  return props;
}

describe('InstructionsPicker', () => {
  it('lists the saved prompts and picks one', () => {
    const props = renderPicker();
    fireEvent.click(screen.getByRole('option', { name: /Haiku/ }));
    expect(props.onPick).toHaveBeenCalledWith(prompts[1]);
  });

  it('filters by name and by text', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter prompts' }), { target: { value: 'senior' } });
    expect(screen.getByRole('option', { name: /Reviewer/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Haiku/ })).toBeNull();
  });

  it('offers None, marked while nothing is chosen', () => {
    const props = renderPicker();
    const none = screen.getByRole('option', { name: 'None' });
    expect(none).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(none);
    expect(props.onClear).toHaveBeenCalled();
  });

  it('marks the current choice', () => {
    renderPicker({ selectedId: 'p-1' });
    expect(screen.getByRole('option', { name: /Reviewer/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'None' })).toHaveAttribute('aria-selected', 'false');
  });

  it('says so when the library could not be read, rather than looking empty', () => {
    renderPicker({ prompts: [], error: 'boom' });
    expect(screen.getByText('The prompt library could not be read.')).toBeInTheDocument();
    expect(screen.queryByText(/No saved prompts yet/)).toBeNull();
  });

  it('points to the library when there are no prompts', () => {
    const props = renderPicker({ prompts: [] });
    expect(screen.getByText('No saved prompts yet. Write one in the Prompt Library.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Prompt Library' }));
    expect(props.onOpenLibrary).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const props = renderPicker();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalled();
  });
});
