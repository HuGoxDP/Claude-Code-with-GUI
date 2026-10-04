import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { updateJsonFile } from './atomic-json';
import type { SessionInfo } from './extractSessionInfo';

/**
 * Titles this app generated for sessions, by session id.
 *
 * Kept in our own file beside the rename overrides rather than in the
 * transcript: the transcript is the CLI's, and the app does not append to it.
 */
const AI_TITLES_FILE = '.claude-code-gui-ai-titles.json';

type AiTitles = Record<string, string>;

function getAiTitlesFile(sessionsPath: string): string {
  return join(sessionsPath, AI_TITLES_FILE);
}

export async function readSessionAiTitles(sessionsPath: string): Promise<AiTitles> {
  try {
    const raw = await readFile(getAiTitlesFile(sessionsPath), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    ) as AiTitles;
  } catch {
    return {};
  }
}

/**
 * Atomic, and refuses to replace a file it cannot parse, like the rename
 * overrides. The refusal throws, so a title that was not stored is never
 * announced as the session's name.
 */
export async function writeSessionAiTitle(
  sessionsPath: string,
  sessionId: string,
  title: string,
): Promise<void> {
  await mkdir(sessionsPath, { recursive: true });
  const result = await updateJsonFile(getAiTitlesFile(sessionsPath), (current) => {
    current[sessionId] = title;
    return current;
  });
  if (result.status === 'error') throw new Error(result.error);
}

export async function removeSessionAiTitle(
  sessionsPath: string,
  sessionId: string,
): Promise<void> {
  await updateJsonFile(getAiTitlesFile(sessionsPath), (current) => {
    if (!(sessionId in current)) return null;
    delete current[sessionId];
    return current;
  });
}

/**
 * The title a session row shows.
 *
 * A rename made in this app wins, as it always has. Next comes any name Claude
 * Code recorded itself (`--name`, `/rename`, its own generated title). A title
 * this app generated stands in for the CLI's generated one when there is none,
 * so it outranks a summary and the first prompt, as the CLI's does.
 *
 * The session list, a single row and the export all name a session through
 * here, so the three never disagree.
 */
export function displayTitle(
  info: Pick<SessionInfo, 'title' | 'titleSource'>,
  override?: string,
  generated?: string,
): string {
  if (override) return override;
  if (generated && (info.titleSource === 'summary' || info.titleSource === 'prompt')) return generated;
  return info.title;
}
