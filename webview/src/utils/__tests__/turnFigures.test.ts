import { describe, expect, it } from 'vitest';
import { formatTokenCount, formatTurnDuration, placeTurnResult, turnFiguresOf } from '../turnFigures';
import { LoadedMessageType } from '../../dto/common';
import type { LoadedMessageDto } from '../../types';

// The shape the CLI sends (2.1.289), trimmed to what is read.
const result = (over: Partial<LoadedMessageDto> = {}): LoadedMessageDto => ({
  type: LoadedMessageType.Result,
  duration_ms: 1277,
  usage: { input_tokens: 2, cache_creation_input_tokens: 5728, cache_read_input_tokens: 11809, output_tokens: 3 },
  ...over,
}) as LoadedMessageDto;

describe('turn figures', () => {
  it('adds every kind of input token, and keeps them apart for the detail', () => {
    expect(turnFiguresOf(result())).toEqual({
      durationMs: 1277,
      inputTokens: 17539,
      freshInputTokens: 2,
      cacheWriteTokens: 5728,
      cacheReadTokens: 11809,
      outputTokens: 3,
    });
  });

  it('has nothing to say about a turn that never reached the model', () => {
    expect(turnFiguresOf(result({ usage: { input_tokens: 0, output_tokens: 0 } }))).toBeNull();
    expect(turnFiguresOf(result({ usage: undefined }))).toBeNull();
    expect(turnFiguresOf(result({ duration_ms: undefined }))).toBeNull();
  });

  it('formats durations like a clock and counts compactly', () => {
    expect(formatTurnDuration(1277)).toBe('0:01');
    expect(formatTurnDuration(750_000)).toBe('12:30');
    expect(formatTurnDuration(3_725_000)).toBe('1:02:05');
    expect(formatTokenCount(58)).toBe('58');
    expect(formatTokenCount(17539)).toBe('17.5K');
    expect(formatTokenCount(1_234_567)).toBe('1.2M');
  });
});

describe('placeTurnResult', () => {
  const at = (iso: string) => Date.parse(iso);
  const send = (uuid: string, timestamp: string): LoadedMessageDto =>
    ({ type: LoadedMessageType.User, uuid, timestamp, message: { role: 'user', content: uuid } }) as LoadedMessageDto;
  const reply = (uuid: string, timestamp: string): LoadedMessageDto =>
    ({ type: LoadedMessageType.Assistant, uuid, timestamp, message: { role: 'assistant', content: [] } }) as LoadedMessageDto;
  const figures = { ...result(), uuid: 'r' } as LoadedMessageDto;
  const uuids = (list: LoadedMessageDto[]) => list.map((m) => m.uuid);

  it('goes last when nothing came after the turn', () => {
    const list = [send('q', '2026-10-06T09:00:00Z'), reply('a', '2026-10-06T09:00:05Z')];
    expect(uuids(placeTurnResult(list, figures, at('2026-10-06T09:00:01Z')))).toEqual(['q', 'a', 'r']);
  });

  it('goes above sends dated after the turn started', () => {
    const list = [
      send('q', '2026-10-06T09:00:00Z'),
      reply('a', '2026-10-06T09:00:05Z'),
      send('next', '2026-10-06T09:00:18Z'),
    ];
    expect(uuids(placeTurnResult(list, figures, at('2026-10-06T09:00:01Z')))).toEqual(['q', 'a', 'r', 'next']);
  });

  it("stays under the turn's own prompt when the turn showed nothing else", () => {
    const list = [reply('old', '2026-10-06T08:59:00Z'), send('q', '2026-10-06T09:00:00Z')];
    expect(uuids(placeTurnResult(list, figures, at('2026-10-06T09:00:01Z')))).toEqual(['old', 'q', 'r']);
  });

  it('goes last when the start of the turn is unknown', () => {
    const list = [reply('a', '2026-10-06T09:00:05Z'), send('next', '2026-10-06T09:00:18Z')];
    expect(uuids(placeTurnResult(list, figures, null))).toEqual(['a', 'next', 'r']);
  });
});
