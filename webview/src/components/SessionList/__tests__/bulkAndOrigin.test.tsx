import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionMetaDto } from '@/dto';
import { groupSessionsByDate, sessionOriginOf } from '../utils';

const ROOT = '/repo';

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: ROOT }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({ scopeDirCount: null }),
}));
vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: {}, open: new Set(), markRead: vi.fn() }),
}));
const toastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: (m: string) => toastSuccess(m), error: vi.fn() } }));

const NOW = new Date('2026-10-04T12:00:00');

function session(id: string, title: string, entrypoint: string | null = 'sdk-cli'): SessionMetaDto {
  const at = new Date('2026-10-04T10:00:00');
  return Object.assign(new SessionMetaDto(), {
    id, title, sessionDir: ROOT, createdAt: at, updatedAt: at, messageCount: 1, isSidechain: false, entrypoint,
  });
}

const A = session('a', 'Made here');
const B = session('b', 'Made in a terminal', 'cli');
const C = session('c', 'Made in VS Code', 'claude-vscode');

function renderList(onDeleteSessions?: (ids: string[]) => Promise<boolean>) {
  const onSelectSession = vi.fn();
  render(
    <SessionList
      groupedSessions={groupSessionsByDate([A, B, C], NOW)}
      currentSessionId={null}
      onSelectSession={onSelectSession}
      onDeleteSession={vi.fn()}
      onRenameSession={vi.fn()}
      onDeleteSessions={onDeleteSessions}
    />,
  );
  return { onSelectSession };
}

beforeEach(() => toastSuccess.mockClear());

describe('sessionOriginOf', () => {
  it('names sessions that came from somewhere else, and not the ones a program drove', () => {
    expect(sessionOriginOf('cli')).toBe('terminal');
    expect(sessionOriginOf('claude-vscode')).toBe('vscode');
    expect(sessionOriginOf('claude-desktop')).toBe('desktop');
    expect(sessionOriginOf('remote_mobile')).toBe('remote');
    expect(sessionOriginOf('claude-code-github-action')).toBe('githubAction');
    expect(sessionOriginOf('sdk-cli')).toBeNull();
    expect(sessionOriginOf(null)).toBeNull();
  });
});

describe('the session row', () => {
  it('marks where a session was started when it was not here', () => {
    renderList();
    const badges = screen.getAllByTestId('session-origin').map((el) => el.textContent);
    expect(badges).toEqual(['Terminal', 'VS Code']);
  });

  it('copies the session id from the row', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderList();
    fireEvent.mouseEnter(screen.getByText('Made here').closest('button')!);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy session ID' }));
    });

    expect(writeText).toHaveBeenCalledWith('a');
    expect(toastSuccess).toHaveBeenCalledWith('Session ID copied');
  });
});

describe('choosing several sessions', () => {
  it('offers no Select button without a bulk delete', () => {
    renderList();
    expect(screen.queryByTestId('session-select-start')).toBeNull();
  });

  it('toggles rows instead of opening them, and deletes the chosen ones', () => {
    const onDeleteSessions = vi.fn(async () => true);
    const { onSelectSession } = renderList(onDeleteSessions);

    fireEvent.click(screen.getByTestId('session-select-start'));
    fireEvent.click(screen.getByText('Made here'));
    fireEvent.click(screen.getByText('Made in VS Code'));
    fireEvent.click(screen.getByText('Made here'));

    expect(onSelectSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('session-selection-delete'));
    expect(onDeleteSessions).toHaveBeenCalledWith(['c']);
  });

  it('chooses every row with All, and leaves the mode with Cancel', () => {
    const onDeleteSessions = vi.fn(async () => false);
    renderList(onDeleteSessions);

    fireEvent.click(screen.getByTestId('session-select-start'));
    fireEvent.click(screen.getByText('All'));
    fireEvent.click(screen.getByTestId('session-selection-delete'));
    expect((onDeleteSessions.mock.calls[0] as unknown as [string[]])[0].sort()).toEqual(['a', 'b', 'c']);

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('session-selection-bar')).toBeNull();
    expect(screen.queryAllByTestId('session-select-checkbox')).toHaveLength(0);
  });

  it('keeps the choice when the deletion is called off, and leaves the mode once it is done', async () => {
    let answer = false;
    const onDeleteSessions = vi.fn(async () => answer);
    renderList(onDeleteSessions);

    fireEvent.click(screen.getByTestId('session-select-start'));
    fireEvent.click(screen.getByText('Made in a terminal'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('session-selection-delete'));
    });
    expect(screen.getByTestId('session-selection-bar').textContent).toContain('1 selected');

    answer = true;
    await act(async () => {
      fireEvent.click(screen.getByTestId('session-selection-delete'));
    });
    expect(onDeleteSessions).toHaveBeenLastCalledWith(['b']);
    expect(screen.queryByTestId('session-selection-bar')).toBeNull();
  });

  it('cannot delete with nothing chosen', () => {
    renderList(vi.fn(async () => true));
    fireEvent.click(screen.getByTestId('session-select-start'));
    expect((screen.getByTestId('session-selection-delete') as HTMLButtonElement).disabled).toBe(true);
  });
});
