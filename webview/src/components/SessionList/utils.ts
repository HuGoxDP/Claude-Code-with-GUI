import { SessionMetaDto } from '@/dto';
import { i18n } from '@/i18n';
import { isSameWorkingDir, relativeWorkingDir, workingDirName } from '@/shared';

/**
 * 상대 시간 표시 (Cursor 방식). 표기는 활성 로케일을 따른다.
 * - 1분 미만: "now" / "방금"
 * - 1분~59분: "5m" / "5분"  (이하 시/일/월/년)
 */
/**
 * Label naming which project a session came from.
 *
 * Every row gets one while directories are merged — including the anchor's own
 * sessions, which are named by their folder. Labelling only the nested rows
 * would leave the anchor's rows looking like they had no origin at all, and
 * make the rows uneven to scan.
 *
 * Nested rows show the path RELATIVE to the anchor (`packages/battery`): the
 * shared prefix is the same on every row, so repeating it would push the part
 * that actually distinguishes them out of a narrow dropdown.
 */
export function getSessionOriginLabel(
  sessionDir: string | undefined,
  rootDir: string | null,
): string | undefined {
  if (!sessionDir || !rootDir) return undefined;
  if (isSameWorkingDir(sessionDir, rootDir)) return workingDirName(sessionDir);

  const relative = relativeWorkingDir(sessionDir, rootDir);
  if (relative !== null) return relative;

  // Outside the anchor entirely: nothing to trim against, so name it in full.
  return sessionDir;
}

export function getRelativeTime(date: Date): string {
  const elapsed = Date.now() - date.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const rt = (unit: string, n: number) => i18n.t(`common:sessionList.relativeTime.${unit}`, { n });
  if (years > 0) return rt('years', years);
  if (months > 0) return rt('months', months);
  if (days > 0) return rt('days', days);
  if (hours > 0) return rt('hours', hours);
  if (minutes > 0) return rt('minutes', minutes);
  return i18n.t('common:sessionList.relativeTime.now');
}

export enum SessionGroup {
  Today = 'today',
  Yesterday = 'yesterday',
  PastWeek = 'pastWeek',
  PastMonth = 'pastMonth',
  PastYear = 'pastYear',
}

/**
 * Sessions by group. `favorites` is optional so a caller that never stars
 * anything (and the many test fixtures that predate stars) can leave it out;
 * read groups through {@link sessionsInGroup} rather than indexing directly.
 */
export type GroupedSessions = Record<SessionGroup, SessionMetaDto[]> & {
  [FAVORITES_GROUP]?: SessionMetaDto[];
};

/** The starred sessions' group, drawn above every date group. */
export const FAVORITES_GROUP = 'favorites' as const;

export type DisplayGroup = SessionGroup | typeof FAVORITES_GROUP;

// Group headers are resolved through i18n at render time
// (common:sessionList.groups.<SessionGroup>), so there is no static label map.

export const GROUP_ORDER: SessionGroup[] = [
  SessionGroup.Today,
  SessionGroup.Yesterday,
  SessionGroup.PastWeek,
  SessionGroup.PastMonth,
  SessionGroup.PastYear,
];

/** Every group in the order the list draws them: stars first, then by date. */
export const DISPLAY_GROUP_ORDER: DisplayGroup[] = [FAVORITES_GROUP, ...GROUP_ORDER];

/** The sessions of one group; an absent favorites group is simply empty. */
export function sessionsInGroup(groups: GroupedSessions, key: DisplayGroup): SessionMetaDto[] {
  return groups[key] ?? [];
}

/**
 * 세션의 updatedAt 날짜를 기준으로 그룹을 결정
 * - Today/Yesterday: 날짜 기준 (00:00 시작점)
 * - Past week/Past month/Past year: 경과 시간 기준 (현재 시간으로부터)
 * @param date - 세션의 updatedAt 날짜
 * @param now - 현재 시간 (테스트 시 시간 주입용, 기본값: new Date())
 */
export function getSessionGroup(date: Date, now: Date = new Date()): SessionGroup {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

  // Today/Yesterday: 날짜 기준 (Cursor 방식)
  if (date >= todayStart) return SessionGroup.Today;
  if (date >= yesterdayStart) return SessionGroup.Yesterday;

  // Past week/Past month/Past year: 경과 시간 기준 (Cursor 방식)
  const elapsed = now.getTime() - date.getTime();
  const WEEK_MS = 7 * DAY_MS;
  const MONTH_MS = 30 * DAY_MS;

  if (elapsed <= WEEK_MS) return SessionGroup.PastWeek;
  if (elapsed <= MONTH_MS) return SessionGroup.PastMonth;
  return SessionGroup.PastYear;
}

/**
 * 세션 목록을 날짜별 그룹으로 분류
 * @param sessions - 분류할 세션 목록
 * @param now - 현재 시간 (테스트 시 시간 주입용, 기본값: new Date())
 * @remarks session.updatedAt이 undefined일 경우 'pastYear' 그룹으로 분류
 */
export function groupSessionsByDate(
  sessions: SessionMetaDto[],
  now: Date = new Date(),
  /** Starred session ids; those sessions go to the favorites group instead of a date group. */
  favoriteIds?: ReadonlySet<string>,
): GroupedSessions {
  const groups: GroupedSessions = {
    [FAVORITES_GROUP]: [],
    [SessionGroup.Today]: [],
    [SessionGroup.Yesterday]: [],
    [SessionGroup.PastWeek]: [],
    [SessionGroup.PastMonth]: [],
    [SessionGroup.PastYear]: [],
  };

  for (const session of sessions) {
    if (favoriteIds?.has(session.id)) {
      groups[FAVORITES_GROUP]!.push(session);
      continue;
    }
    // updatedAt이 런타임에 undefined일 수 있음 (DTO 타입은 non-optional이지만 방어적 처리)
    const group = session.updatedAt ? getSessionGroup(session.updatedAt, now) : SessionGroup.PastYear;
    groups[group].push(session);
  }

  return groups;
}

/** Where a session was started, as far as the session list names it. */
export type SessionOrigin = 'terminal' | 'vscode' | 'desktop' | 'remote' | 'githubAction';

/**
 * The place a session was started, from the CLI's `entrypoint`, or null when
 * the list should not name one.
 *
 * Sessions started by a program driving the CLI (`sdk-cli`, `sdk-ts`,
 * `sdk-py`, which is how this app runs it) carry no badge: they are most of the
 * list, and a badge on nearly every row says nothing. The badge marks the
 * sessions that came from somewhere else.
 */
export function sessionOriginOf(entrypoint: string | null | undefined): SessionOrigin | null {
  switch (entrypoint) {
    case 'cli':
      return 'terminal';
    case 'claude-vscode':
      return 'vscode';
    case 'claude-desktop':
    case 'claude-desktop-3p':
      return 'desktop';
    case 'claude-code-github-action':
      return 'githubAction';
  }
  if (entrypoint && (entrypoint.startsWith('remote') || entrypoint === 'ssh-remote')) return 'remote';
  return null;
}
