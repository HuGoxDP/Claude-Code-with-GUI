import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, truncate } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import {
  checkFontFilePath,
  expandHome,
  fontFormatOf,
  FontFileError,
  FONT_FILE_MAX_BYTES,
  readFontFile,
} from '../fontFiles';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'font-files-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('fontFormatOf', () => {
  it('names the format of each extension a FontFace can load, whatever its case', () => {
    expect(fontFormatOf('/f/a.ttf')).toBe('truetype');
    expect(fontFormatOf('/f/a.OTF')).toBe('opentype');
    expect(fontFormatOf('/f/a.woff')).toBe('woff');
    expect(fontFormatOf('/f/a.Woff2')).toBe('woff2');
  });

  it('has no format for anything else', () => {
    expect(fontFormatOf('/f/a.txt')).toBeNull();
    expect(fontFormatOf('/f/ttf')).toBeNull();
    expect(fontFormatOf('/f/a.ttc')).toBeNull();
  });
});

describe('expandHome', () => {
  it('reads a leading ~ as the home folder, as a shell would', () => {
    expect(expandHome('~')).toBe(homedir());
    expect(expandHome('~/fonts/a.ttf')).toBe(join(homedir(), 'fonts/a.ttf'));
  });

  it('leaves a ~ anywhere else alone', () => {
    expect(expandHome('/f/~/a.ttf')).toBe('/f/~/a.ttf');
    expect(expandHome('~other/a.ttf')).toBe('~other/a.ttf');
  });
});

describe('checkFontFilePath', () => {
  it('accepts an absolute path, or one from the home folder, to a font', () => {
    expect(checkFontFilePath('/fonts/Inter.ttf')).toBeNull();
    expect(checkFontFilePath('~/fonts/Inter.otf')).toBeNull();
    expect(checkFontFilePath('  /fonts/Inter.ttf  ')).toBeNull();
  });

  it('refuses a relative path, which would be relative to a guess', () => {
    expect(checkFontFilePath('fonts/Inter.ttf')).toBe(FontFileError.NOT_ABSOLUTE);
  });

  it('refuses a file no FontFace can load', () => {
    expect(checkFontFilePath('/fonts/readme.txt')).toBe(FontFileError.UNSUPPORTED);
  });
});

describe('readFontFile', () => {
  it('answers with the bytes as base64, their format and size', async () => {
    const path = join(dir, 'Font.ttf');
    await writeFile(path, Buffer.from([0, 1, 0, 0, 0xff]));

    const result = await readFontFile(path);

    expect(result).toEqual({ status: 'ok', data: 'AAEAAP8=', format: 'truetype', size: 5 });
  });

  it('says notFound for a missing file, and for a folder named like a font', async () => {
    expect(await readFontFile(join(dir, 'missing.ttf'))).toEqual({ status: 'error', code: FontFileError.NOT_FOUND });

    const folder = join(dir, 'folder.otf');
    await mkdir(folder);
    expect(await readFontFile(folder)).toEqual({ status: 'error', code: FontFileError.NOT_FOUND });
  });

  it('says tooLarge without reading a file over the limit', async () => {
    const path = join(dir, 'Huge.woff2');
    await writeFile(path, '');
    // Sparse: the size is what is checked, so no 32 MB need be written.
    await truncate(path, FONT_FILE_MAX_BYTES + 1);

    expect(await readFontFile(path)).toEqual({ status: 'error', code: FontFileError.TOO_LARGE });
  });

  it('checks the path before touching the disk', async () => {
    expect(await readFontFile('Font.ttf')).toEqual({ status: 'error', code: FontFileError.NOT_ABSOLUTE });
    expect(await readFontFile(join(dir, 'notes.txt'))).toEqual({ status: 'error', code: FontFileError.UNSUPPORTED });
  });
});
