import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionMetaDto } from '@/dto';
import { FAVORITES_GROUP, SessionGroup, groupSessionsByDate, type GroupedSessions } from '../utils';

const ROOT = '/repo';

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: ROOT }),
}));

const setSessionFavorite = vi.fn().mockResolvedValue(undefined);
const exportSession = vi.fn().mockResolvedValue({ status: 'ok', path: null });
let favorites = new Set<string>();
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({
    scopeDirCount: null,
    favoriteSessionIds: favorites,
    setSessionFavorite,
    exportSession,
  }),
}));

vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: {}, open: new Set(), markRead: vi.fn() }),
}));

const NOW = new Date('2026-10-04T12:00:00');

function session(id: string, title: string, updatedAt: Date): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title,
    sessionDir: ROOT,
    createdAt: updatedAt,
    updatedAt,
    messageCount: 1,
    isSidechain: false,
  });
}

const TODAY = session('a', 'Today chat', new Date('2026-10-04T10:00:00'));
const OLD = session('b', 'Old chat', new Date('2025-01-01T10:00:00'));

beforeEach(() => {
  favorites = new Set();
  setSessionFavorite.mockClear();
});

describe('groupSessionsByDate with favorites', () => {
  it('moves starred sessions into the favorites group', () => {
    const groups = groupSessionsByDate([TODAY, OLD], NOW, new Set(['b']));
    expect(groups[FAVORITES_GROUP]?.map((s) => s.id)).toEqual(['b']);
    expect(groups[SessionGroup.Today].map((s) => s.id)).toEqual(['a']);
    expect(groups[SessionGroup.PastYear]).toEqual([]);
  });

  it('leaves the favorites group empty without stars', () => {
    expect(groupSessionsByDate([TODAY], NOW)[FAVORITES_GROUP]).toEqual([]);
  });
});

describe('SessionList favorites', () => {
  function renderList(groups: GroupedSessions) {
    render(
      <SessionList
        groupedSessions={groups}
        currentSessionId={null}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );
  }

  it('draws the favorites group above the date groups, with a star on its rows', () => {
    favorites = new Set(['b']);
    renderList(groupSessionsByDate([TODAY, OLD], NOW, favorites));
    const headers = screen.getAllByText(/^(Favorites|Today)$/).map((el) => el.textContent);
    expect(headers).toEqual(['Favorites', 'Today']);
    const oldRow = screen.getByRole('button', { name: /Old chat/ });
    expect(within(oldRow).getByTestId('session-favorite-mark')).toBeDefined();
  });

  it('stars a session from its row without opening it', () => {
    renderList(groupSessionsByDate([TODAY], NOW, favorites));
    const row = screen.getByRole('button', { name: /Today chat/ });
    fireEvent.mouseEnter(row);
    fireEvent.click(screen.getByTitle('Add to favorites'));
    expect(setSessionFavorite).toHaveBeenCalledWith('a', true);
  });

  it('unstars a starred session', () => {
    favorites = new Set(['a']);
    renderList(groupSessionsByDate([TODAY], NOW, favorites));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Today chat/ }));
    fireEvent.click(screen.getByTitle('Remove from favorites'));
    expect(setSessionFavorite).toHaveBeenCalledWith('a', false);
  });

  it('still renders lists built without a favorites group', () => {
    renderList({
      [SessionGroup.Today]: [TODAY],
      [SessionGroup.Yesterday]: [],
      [SessionGroup.PastWeek]: [],
      [SessionGroup.PastMonth]: [],
      [SessionGroup.PastYear]: [],
    });
    expect(screen.getByText('Today chat')).toBeDefined();
    expect(screen.queryByText('Favorites')).toBeNull();
  });
});
