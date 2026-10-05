import { describe, expect, it } from 'vitest';
import { formatTokenCount, formatTurnDuration, turnFiguresOf } from '../turnFigures';
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
