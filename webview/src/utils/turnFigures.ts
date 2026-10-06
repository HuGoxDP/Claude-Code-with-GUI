import type { LoadedMessageDto } from '../types';
import { isUserSend } from '../pages/ChatPage/paging';

/** What one finished turn cost, read from the CLI's `result` event. */
export interface TurnFigures {
  durationMs: number;
  /** Every input token the turn sent: fresh, written to the cache, and read from it. */
  inputTokens: number;
  freshInputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/**
 * The figures of a `result` entry, or null when there is nothing worth a line:
 * a turn that never reached the model (a local slash command, a request refused
 * before it was sent) reports no tokens, and a duration alone would only add a
 * row of noise under it.
 */
export function turnFiguresOf(entry: LoadedMessageDto): TurnFigures | null {
  if (typeof entry.duration_ms !== 'number' || !Number.isFinite(entry.duration_ms)) return null;
  const usage = entry.usage ?? {};
  const freshInputTokens = count(usage.input_tokens);
  const cacheWriteTokens = count(usage.cache_creation_input_tokens);
  const cacheReadTokens = count(usage.cache_read_input_tokens);
  const outputTokens = count(usage.output_tokens);
  const inputTokens = freshInputTokens + cacheWriteTokens + cacheReadTokens;
  if (inputTokens === 0 && outputTokens === 0) return null;
  return { durationMs: Math.max(0, entry.duration_ms), inputTokens, freshInputTokens, cacheWriteTokens, cacheReadTokens, outputTokens };
}

/** `0:09`, `12:30`, `1:02:05`. */
export function formatTurnDuration(durationMs: number): string {
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** `58`, `17.5K`, `1.2M`. */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/**
 * [messages] with a turn's `result` entry placed as the last word of that turn.
 *
 * That is the end of the list, unless a send that came in after the turn ended
 * is already there: when a turn ends the backend releases the next queued
 * message, and broadcasts its bubble, before it passes the CLI's `result` on.
 * Appended blindly, the figures of one turn would sit under the next turn's
 * prompt. A send dated after the turn started ([turnStartMs]) belongs to a later
 * turn — the turn's own prompt was sent before the turn began — so the entry
 * goes above every such send at the end of the list.
 */
export function placeTurnResult(
  messages: LoadedMessageDto[],
  result: LoadedMessageDto,
  turnStartMs: number | null,
): LoadedMessageDto[] {
  let at = messages.length;
  if (turnStartMs !== null) {
    while (at > 0) {
      const entry = messages[at - 1];
      const sentAt = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
      if (!isUserSend(entry) || !(sentAt > turnStartMs)) break;
      at--;
    }
  }
  return [...messages.slice(0, at), result, ...messages.slice(at)];
}
