/** The changed-files panel: list, revert (with the changed-since second ask), keep all. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { MessageType } from '@/shared';

const send = vi.fn();
vi.mock('@/contexts/BridgeContext', () => ({ useBridgeContext: () => ({ send }) }));
vi.mock('@/contexts/ChatStreamContext', () => ({ useChatStreamContext: () => ({ isStreaming: false }) }));
vi.mock('@/hooks/useSessionAssets', () => ({
  useSessionScope: () => ({ workingDir: '/work/app', sessionId: 's1' }),
}));
vi.mock('@/pages/ChatPage/SessionHeader/dock/useDockLayout', () => ({
  useDockLayout: () => ({ layout: { order: [], visible: [] }, save: vi.fn() }),
}));
const openFile = vi.fn(async () => undefined);
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openFile }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { ChangedFilesModal } from '../index';
import { folderOf } from '../FileRow';

const config = {
  filePath: '/work/app/src/config.toml',
  status: 'modified',
  additions: 2,
  deletions: 1,
  edits: 2,
  lastEditAt: '2026-10-12T10:00:02.000Z',
  changedSince: false,
  missing: false,
  revertable: true,
};
const notes = { ...config, filePath: '/work/app/notes.md', status: 'added', additions: 3, deletions: 0, lastEditAt: '2026-10-12T10:00:05.000Z' };

let listed: Record<string, unknown>[];
let revertReplies: Record<string, unknown>[];

function renderModal() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ChangedFilesModal onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  listed = [notes, config];
  revertReplies = [];
  send.mockReset().mockImplementation(async (type: string, payload: Record<string, unknown>) => {
    if (type === MessageType.GET_SESSION_FILE_CHANGES) {
      return { status: 'ok', files: payload.since ? [] : listed };
    }
    if (type === MessageType.REVERT_SESSION_FILE_CHANGES) {
      return { status: 'ok', files: [], ...(revertReplies.shift() ?? { outcomes: [] }) };
    }
    return { status: 'ok' };
  });
});

describe('folderOf', () => {
  it('shows the folder relative to the project', () => {
    expect(folderOf('/work/app/src/a.ts', '/work/app')).toBe('src');
    expect(folderOf('/work/app/a.ts', '/work/app/')).toBe('');
    expect(folderOf('/elsewhere/a.ts', '/work/app')).toBe('/elsewhere');
    expect(folderOf('C:\\work\\app\\src\\a.ts', 'C:\\work\\app')).toBe('src');
  });
});

describe('ChangedFilesModal', () => {
  it('lists the session’s changed files with their line counts', async () => {
    renderModal();
    expect(await screen.findByText('notes.md')).toBeTruthy();
    expect(screen.getByText('config.toml')).toBeTruthy();
    expect(screen.getByText('src')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('−1')).toBeTruthy();
    expect(send).toHaveBeenCalledWith(MessageType.GET_SESSION_FILE_CHANGES, { workingDir: '/work/app', sessionId: 's1', since: null });
  });

  it('says so when nothing changed', async () => {
    listed = [];
    renderModal();
    expect(await screen.findByText('Claude has not changed any files in this session.')).toBeTruthy();
  });

  it('reverts a file after asking, and asks again before throwing away later changes', async () => {
    revertReplies = [
      { outcomes: [{ filePath: config.filePath, ok: false, reason: 'changed-since' }] },
      { outcomes: [{ filePath: config.filePath, ok: true }] },
    ];
    renderModal();
    await screen.findByText('config.toml');
    fireEvent.click(screen.getAllByRole('button', { name: 'Revert' })[1]);
    expect(await screen.findByText('config.toml goes back to how it was before Claude changed it in this session.')).toBeTruthy();
    const revertButtons = screen.getAllByRole('button', { name: 'Revert' });
    fireEvent.click(revertButtons[revertButtons.length - 1]);

    expect(await screen.findByText(/changed after Claude's last edit. Reverting also throws away/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revert anyway' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        MessageType.REVERT_SESSION_FILE_CHANGES,
        expect.objectContaining({ filePaths: [config.filePath], force: true }),
      ),
    );
    expect(send).toHaveBeenCalledWith(
      MessageType.REVERT_SESSION_FILE_CHANGES,
      expect.objectContaining({ filePaths: [config.filePath], force: false }),
    );
  });

  it('warns that a file Claude created is deleted', async () => {
    renderModal();
    await screen.findByText('notes.md');
    fireEvent.click(screen.getAllByRole('button', { name: 'Revert' })[0]);
    expect(await screen.findByText('notes.md was created by Claude in this session and will be deleted.')).toBeTruthy();
  });

  it('keeps all: the list then starts after the newest edit', async () => {
    renderModal();
    await screen.findByText('notes.md');
    fireEvent.click(screen.getByRole('button', { name: 'Keep all' }));
    expect(localStorage.getItem('ccg-file-changes-kept:s1')).toBe('2026-10-12T10:00:05.000Z');
    expect(await screen.findByText('Nothing changed since you kept the earlier changes.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(await screen.findByText('notes.md')).toBeTruthy();
    expect(localStorage.getItem('ccg-file-changes-kept:s1')).toBeNull();
  });

  it('marks files that changed after Claude, or cannot be put back', async () => {
    listed = [{ ...config, changedSince: true, revertable: false }];
    renderModal();
    expect(await screen.findByText("Changed after Claude's last edit · Earlier version not recorded")).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Revert' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reads the files again each time it opens, even right after the last time', async () => {
    const client = createTestQueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <ChangedFilesModal onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText('config.toml');
    view.unmount();
    listed = [{ ...config, changedSince: true }];
    render(
      <QueryClientProvider client={client}>
        <ChangedFilesModal onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Changed after Claude's last edit")).toBeTruthy();
  });

  it('opens the file in the editor', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('config.toml'));
    expect(openFile).toHaveBeenCalledWith(config.filePath);
  });
});
