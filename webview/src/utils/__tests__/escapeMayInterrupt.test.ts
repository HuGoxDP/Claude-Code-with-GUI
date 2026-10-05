import { describe, it, expect } from 'vitest';
import { escapeMayInterrupt } from '../escapeMayInterrupt';

describe('escapeMayInterrupt', () => {
  it('reads a plain Escape as a request to stop', () => {
    expect(escapeMayInterrupt({ key: 'Escape', defaultPrevented: false }, false)).toBe(true);
  });

  it('does not read an Escape something else already used', () => {
    expect(escapeMayInterrupt({ key: 'Escape', defaultPrevented: true }, false)).toBe(false);
  });

  it('leaves the schedule popover its own Escape', () => {
    expect(escapeMayInterrupt({ key: 'Escape', defaultPrevented: false }, true)).toBe(false);
  });

  it('ignores every other key', () => {
    expect(escapeMayInterrupt({ key: 'Enter', defaultPrevented: false }, false)).toBe(false);
  });
});
