import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptEnhancerDialog } from '../index';
import type { PromptEnhancerState } from '@/pages/ChatPage/ChatInput/hooks/usePromptEnhancer';

function renderDialog(state: PromptEnhancerState) {
  const props = {
    onUse: vi.fn(),
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onChangeEnhanced: vi.fn(),
  };
  const view = render(<PromptEnhancerDialog state={state} {...props} />);
  return { ...props, ...view };
}

const ready: PromptEnhancerState = { phase: 'ready', original: 'fix it', enhanced: 'Fix the login bug.', error: null };

describe('PromptEnhancerDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = renderDialog({ phase: 'idle', original: '', enhanced: '', error: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the draft and a disabled Use button while loading', () => {
    renderDialog({ phase: 'loading', original: 'fix it', enhanced: '', error: null });
    expect(screen.getByTestId('prompt-enhancer-original')).toHaveTextContent('fix it');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use enhanced' })).toBeDisabled();
    // Nothing to retry yet.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('puts the caret in the rewrite once it arrives, and lets it be edited', () => {
    const { onChangeEnhanced } = renderDialog(ready);
    const field = screen.getByRole('textbox', { name: 'Enhanced' }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(ready.enhanced.length);

    fireEvent.change(field, { target: { value: 'Fix the logout bug.' } });
    expect(onChangeEnhanced).toHaveBeenCalledWith('Fix the logout bug.');
  });

  it('uses the rewrite on the button and on Cmd/Ctrl+Enter, but not on plain Enter', () => {
    const { onUse } = renderDialog(ready);
    const field = screen.getByRole('textbox', { name: 'Enhanced' });

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onUse).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(onUse).toHaveBeenCalledWith('Fix the login bug.');

    fireEvent.click(screen.getByRole('button', { name: 'Use enhanced' }));
    expect(onUse).toHaveBeenCalledTimes(2);
  });

  it('does not use a rewrite that was edited down to nothing', () => {
    const { onUse } = renderDialog({ ...ready, enhanced: '   ' });
    expect(screen.getByRole('button', { name: 'Use enhanced' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Enhanced' }), { key: 'Enter', metaKey: true });
    expect(onUse).not.toHaveBeenCalled();
  });

  it('closes on Escape, on Keep original and on the backdrop', () => {
    const { onClose } = renderDialog(ready);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep original' }));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows the CLI message as is, and a known code as a sentence', () => {
    const { rerender, onRetry, onUse, onClose, onChangeEnhanced } = renderDialog({
      phase: 'error', original: 'x', enhanced: '', error: 'Not logged in · Please run /login',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Not logged in · Please run /login');

    rerender(
      <PromptEnhancerDialog
        state={{ phase: 'error', original: 'x', enhanced: '', error: 'empty-result' }}
        onUse={onUse} onClose={onClose} onRetry={onRetry} onChangeEnhanced={onChangeEnhanced}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The model returned nothing to use.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('empty-result');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
