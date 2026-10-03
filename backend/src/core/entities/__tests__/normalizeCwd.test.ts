import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizeCwd } from '../normalizeCwd';

/**
 * Every entity row carries a `cwd`, and rows are found again by comparing it with
 * the directory a project is opened from. Two spellings of one folder would split
 * a project's rows in two.
 */
describe('normalizeCwd', () => {
  let root: string;

  beforeEach(() => {
    // realpath so the expectations hold on macOS, where /var is a link to /private/var.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'normalize-cwd-')));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves an already normal path alone', () => {
    expect(normalizeCwd(root)).toBe(root);
  });

  it('drops a trailing separator', () => {
    expect(normalizeCwd(`${root}/`)).toBe(root);
  });

  it('resolves `..` and doubled separators', () => {
    mkdirSync(join(root, 'a'));
    expect(normalizeCwd(`${root}//a/../a/`)).toBe(join(root, 'a'));
  });

  // The same folder reached through a link must be the same project.
  it('follows a symbolic link to the real folder', () => {
    mkdirSync(join(root, 'real'));
    symlinkSync(join(root, 'real'), join(root, 'link'));

    expect(normalizeCwd(join(root, 'link'))).toBe(join(root, 'real'));
  });

  // Rows of a deleted or unmounted project must stay addressable.
  it('keeps the resolved spelling of a folder that does not exist', () => {
    expect(normalizeCwd(`${root}/gone/`)).toBe(join(root, 'gone'));
  });

  // A relative path resolves against whatever directory the process is in, which
  // says nothing about a project.
  it('refuses a relative path', () => {
    expect(() => normalizeCwd('some/project')).toThrow(/absolute/);
  });

  it('refuses an empty path', () => {
    expect(() => normalizeCwd('   ')).toThrow(/empty/);
  });

  it('trims the whitespace around a path', () => {
    expect(normalizeCwd(`  ${root}  `)).toBe(root);
  });
});
