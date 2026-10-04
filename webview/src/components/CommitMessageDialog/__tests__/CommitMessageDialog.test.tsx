import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CommitMessageDialog, COMMIT_MESSAGE_TIMEOUT_MS } from '../index';
import { MessageType } from '@/shared';

type Send = Parameters<typeof CommitMessageDialog>[0]['send'];

function renderDialog(send: ReturnType<typeof vi.fn>) {
  const onClose = vi.fn();
  const view = render(
    <CommitMessageDialog send={send as unknown as Send} workingDirectory="/project" model="sonnet" onClose={onClose} />,
  );
  return { onClose, ...view };
}

describe('CommitMessageDialog', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('asks for a message for the project with the current model, and shows it with its scope', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'ok', message: 'fix: x\n\n- y', scope: 'staged' });
    renderDialog(send);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(
      MessageType.GENERATE_COMMIT_MESSAGE,
      { workingDir: '/project', model: 'sonnet' },
      { timeout: COMMIT_MESSAGE_TIMEOUT_MS },
    );

    const field = await screen.findByRole('textbox', { name: 'Commit message' });
    expect(field).toHaveValue('fix: x\n\n- y');
    expect(screen.getByTestId('commit-message-scope')).toHaveTextContent('For the staged changes');
  });

  it('copies the edited message and closes', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'ok', message: 'fix: x', scope: 'all' });
    const { onClose } = renderDialog(send);
    const field = await screen.findByRole('textbox', { name: 'Commit message' });

    fireEvent.change(field, { target: { value: 'fix: better' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('fix: better');
  });

  it('copies on Cmd/Ctrl+Enter', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'ok', message: 'fix: x', scope: 'all' });
    renderDialog(send);
    const field = await screen.findByRole('textbox', { name: 'Commit message' });
    fireEvent.keyDown(field, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('fix: x'));
  });

  it('puts the backend codes into words and passes the CLI message through', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ status: 'error', error: 'no-changes' })
      .mockResolvedValueOnce({ status: 'error', error: 'Not logged in · Please run /login' });
    renderDialog(send);

    expect(await screen.findByRole('alert')).toHaveTextContent('There is nothing to commit in this project.');
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not logged in · Please run /login'));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('ignores an answer that arrives after it was closed', async () => {
    let resolve!: (value: unknown) => void;
    const send = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = renderDialog(send);
    unmount();
    // Would warn about an update on an unmounted component if the answer landed.
    const spy = vi.spyOn(console, 'error');
    await act(async () => { resolve({ status: 'ok', message: 'late', scope: 'all' }); });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('closes on Escape and keeps Copy off while loading', () => {
    const send = vi.fn().mockReturnValue(new Promise(() => {}));
    const { onClose } = renderDialog(send);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
