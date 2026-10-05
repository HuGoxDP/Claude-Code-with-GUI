import { describe, expect, it } from 'vitest';
import { formatTimeoutChoice } from '../PromptTimeout';

describe('prompt timeout choices', () => {
  it('names each choice in the interface language, with its own plural', () => {
    expect(formatTimeoutChoice(30, 'en')).toBe('30 seconds');
    expect(formatTimeoutChoice(60, 'en')).toBe('1 minute');
    expect(formatTimeoutChoice(300, 'en')).toBe('5 minutes');
    expect(formatTimeoutChoice(3600, 'en')).toBe('1 hour');
    expect(formatTimeoutChoice(120, 'ru')).toBe('2 минуты');
  });
});
