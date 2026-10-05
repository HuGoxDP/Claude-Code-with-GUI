import { describe, it, expect, beforeEach } from 'vitest';
import { TypedKeys, typedKeys, restoreCommandName, type KeyStroke } from '../typedKeys';

const stroke = (code: string, extra: Partial<KeyStroke> = {}): KeyStroke => ({
  code,
  key: 'Process',
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

/** Press the keys of `name` one by one, as a US keyboard would name them. */
function typeKeys(record: TypedKeys, name: string): void {
  for (const char of name) {
    if (char === '/') record.noteKeyDown(stroke('Slash'), true);
    else if (char === ' ') record.noteKeyDown(stroke('Space'), true);
    else record.noteKeyDown(stroke(`Key${char.toUpperCase()}`, { shiftKey: char !== char.toLowerCase() }), true);
    record.noteInput('insertText');
  }
}

describe('TypedKeys', () => {
  let record: TypedKeys;

  beforeEach(() => {
    record = new TypedKeys();
  });

  it('reads /rename off the keys when a Russian layout turned it into other letters', () => {
    typeKeys(record, '/rename');
    record.noteTyped('/кутфьу');
    expect(record.keysFor('/кутфьу')).toBe('/rename');
    expect(record.keysForQuery('кутфьу')).toBe('rename');
  });

  it('gives only the command name when arguments follow it, so the exact-name match of argument mode still holds', () => {
    typeKeys(record, '/rename title');
    record.noteTyped('/кутфьу');
    expect(record.keysForQuery('кутфьу')).toBe('rename');
  });

  it('takes a slash from the character it produced, since the Russian layout types it with Shift+7', () => {
    record.noteKeyDown(stroke('Digit7', { shiftKey: true, key: '/' }), true);
    typeKeys(record, 'rename'.padStart(0));
    record.noteTyped('/кутфьу');
    expect(record.keysFor('/кутфьу')).toBe('/rename');
  });

  it('reads the keys of a three-set Hangul layout, which the two-set table cannot', () => {
    typeKeys(record, '/rename');
    // Under the three-set layout these keys give other letters than the table expects.
    record.noteTyped('/ㅊㅓㅁㅡㅈㅗ');
    expect(record.keysFor('/ㅊㅓㅁㅡㅈㅗ')).toBe('/rename');
  });

  it('keeps the case of Shift', () => {
    typeKeys(record, '/Ab');
    record.noteTyped('/ㅁ최');
    expect(record.keysFor('/ㅁ최')).toBe('/Ab');
  });

  it('falls back to the two-set Hangul table when no key was recorded', () => {
    expect(record.keysFor('/ㄱㄷㅜㅁㅡㄷ')).toBe('/rename');
  });

  it('falls back when the record is shorter than the text, as when the browser reports no key code', () => {
    record.noteKeyDown(stroke('Slash'), true);
    record.noteTyped('/ㄱ두믇');
    expect(record.keysFor('/ㄱ두믇')).toBe('/rename');
  });

  it('returns text that is already ASCII as it is, so the physical keys of a Dvorak or AZERTY layout add nothing', () => {
    typeKeys(record, '/qwerty');
    record.noteTyped('/rename');
    expect(record.keysFor('/rename')).toBe('/rename');
  });

  it('removes the last key on Backspace at the end of the line', () => {
    typeKeys(record, '/rex');
    record.noteTyped('/ㄱㄷㅌ');
    record.noteKeyDown(stroke('Backspace'), true);
    record.noteInput('deleteContentBackward');
    record.noteTyped('/ㄱㄷ');
    expect(record.keysFor('/ㄱㄷ')).toBe('/re');
  });

  it('is set aside after a paste, until the box is empty again', () => {
    typeKeys(record, '/re');
    record.noteInput('insertFromPaste');
    record.noteTyped('/ㅋ');
    // The table answers instead of the keys that no longer match the text.
    expect(record.keysFor('/ㅋ')).toBe('/z');
    record.noteTyped('');
    typeKeys(record, '/re');
    record.noteTyped('/ㄱㄷ');
    expect(record.keysFor('/ㄱㄷ')).toBe('/re');
  });

  it('is set aside when a key is pressed with the caret anywhere but the end', () => {
    typeKeys(record, '/re');
    record.noteKeyDown(stroke('KeyX'), false);
    record.noteTyped('/ㅌ');
    expect(record.keysFor('/ㅌ')).toBe('/x');
  });

  it('is set aside by deleting a word, which removes more than the last key', () => {
    typeKeys(record, '/rename');
    record.noteKeyDown(stroke('Backspace', { altKey: true }), true);
    record.noteTyped('/к');
    // Trusting the record would answer with the keys that were just deleted.
    expect(record.keysFor('/к')).toBe('/к');
  });

  it('is set aside by Delete', () => {
    typeKeys(record, '/rename');
    record.noteKeyDown(stroke('Delete'), true);
    record.noteTyped('/к');
    expect(record.keysFor('/к')).toBe('/к');
  });

  it('ignores a shortcut such as Cmd+A', () => {
    typeKeys(record, '/re');
    record.noteKeyDown(stroke('KeyA', { metaKey: true }), true);
    record.noteTyped('/ㄱㄷ');
    expect(record.keysFor('/ㄱㄷ')).toBe('/re');
  });

  it('starts over when the box is filled by something other than typing', () => {
    typeKeys(record, '/re');
    record.noteTyped('/ㄱㄷ');
    // A history recall writes a different line without a keystroke.
    record.noteValue('/ㅡ');
    expect(record.keysFor('/ㅡ')).toBe('/m');
  });

  it('keeps the record when the box reports the text that typing just produced', () => {
    typeKeys(record, '/re');
    record.noteTyped('/ㄱㄷ');
    record.noteValue('/ㄱㄷ');
    expect(record.keysFor('/ㄱㄷ')).toBe('/re');
  });

  it('starts over once the line no longer begins with a slash', () => {
    typeKeys(record, '/re');
    record.noteTyped('안녕');
    expect(record.keysFor('/ㄱㄷ')).toBe('/re');
    typeKeys(record, 'x');
    record.noteTyped('/ㅌ');
    expect(record.keysFor('/ㅌ')).toBe('/x');
  });
});

describe('restoreCommandName', () => {
  beforeEach(() => {
    typedKeys.noteTyped('');
  });

  it('rewrites the first word when it is the command typed on the Korean layout', () => {
    expect(restoreCommandName('/ㄱㄷㅜㅁㅡㄷ 새 이름', '/rename')).toBe('/rename 새 이름');
    expect(restoreCommandName('/ㄱ두믇', '/rename')).toBe('/rename');
  });

  it('rewrites a command typed on a layout the table does not know, from the keys pressed', () => {
    // The name, the space, and the keys of the argument typed after it.
    typeKeys(typedKeys, '/rename dlfma');
    typedKeys.noteTyped('/кутфьу 이름');
    expect(restoreCommandName('/кутфьу 이름', '/rename')).toBe('/rename 이름');
  });

  it('leaves a line alone when it already starts with the command', () => {
    expect(restoreCommandName('/rename 새 이름', '/rename')).toBe('/rename 새 이름');
  });

  it('leaves a line alone when the first word is some other command', () => {
    expect(restoreCommandName('/ㅡㅐㅇ디 sonnet', '/rename')).toBe('/ㅡㅐㅇ디 sonnet');
  });

  it('only looks at the first word', () => {
    expect(restoreCommandName('please /ㄱㄷㅜㅁㅡㄷ', '/rename')).toBe('please /ㄱㄷㅜㅁㅡㄷ');
  });
});
