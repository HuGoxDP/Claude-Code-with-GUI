import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyFontFile,
  checkFontFilePath,
  FONT_FILE_ATTRIBUTE,
  FONT_FILE_FAMILY,
  fontFileName,
  fontFileNote,
  FontFileErrorCode,
  FontFileKind,
  getFontFileStatus,
  type FontFileDeps,
} from '../fontFiles';

/** A FontFace stand-in: jsdom has none. `bad` makes load() reject, as a non-font does. */
function fakeFace(family: string, bad = false) {
  return { family, load: bad ? () => Promise.reject(new Error('bad font')) : () => Promise.resolve() } as unknown as FontFace;
}

function makeDeps(overrides: Partial<FontFileDeps> = {}) {
  const added: FontFace[] = [];
  const deleted: FontFace[] = [];
  const root = document.createElement('html');
  const deps: FontFileDeps = {
    fetchFont: vi.fn().mockResolvedValue({ status: 'ok', data: 'AAEAAP8=', format: 'truetype', size: 5 }),
    createFace: vi.fn((family: string) => fakeFace(family)),
    fonts: { add: (f: FontFace) => (added.push(f), undefined as never), delete: (f: FontFace) => (deleted.push(f), true) },
    root,
    ...overrides,
  };
  return { deps, added, deleted, root };
}

beforeEach(async () => {
  // Module state outlives a test; null puts each kind back to "none".
  const { deps } = makeDeps();
  await applyFontFile(FontFileKind.TEXT, null, deps);
  await applyFontFile(FontFileKind.CODE, null, deps);
});

describe('checkFontFilePath', () => {
  it('accepts a full path to a font, on any system', () => {
    for (const p of ['/fonts/a.ttf', '~/fonts/a.OTF', 'C:\\Fonts\\a.woff', 'D:/f/a.woff2', '\\\\server\\f\\a.ttf']) {
      expect(checkFontFilePath(p), p).toBeNull();
    }
  });

  it('says what is wrong with a relative path or another kind of file', () => {
    expect(checkFontFilePath('fonts/a.ttf')).toBe(FontFileErrorCode.NOT_ABSOLUTE);
    expect(checkFontFilePath('~fonts/a.ttf')).toBe(FontFileErrorCode.NOT_ABSOLUTE);
    expect(checkFontFilePath('/fonts/a.ttc')).toBe(FontFileErrorCode.UNSUPPORTED);
  });
});

describe('fontFileName', () => {
  it('is the last part of the path, whichever the separator', () => {
    expect(fontFileName('/f/Inter.ttf')).toBe('Inter.ttf');
    expect(fontFileName('C:\\f\\Mono.otf')).toBe('Mono.otf');
  });
});

describe('applyFontFile', () => {
  it('registers the file under our family and marks <html> once it has loaded', async () => {
    const { deps, added, root } = makeDeps();

    await applyFontFile(FontFileKind.CODE, '/f/Mono.ttf', deps);

    expect(deps.fetchFont).toHaveBeenCalledWith('/f/Mono.ttf');
    expect(deps.createFace).toHaveBeenCalledWith(FONT_FILE_FAMILY[FontFileKind.CODE], expect.any(ArrayBuffer));
    const bytes = new Uint8Array((deps.createFace as ReturnType<typeof vi.fn>).mock.calls[0][1]);
    expect([...bytes]).toEqual([0, 1, 0, 0, 255]);
    expect(added).toHaveLength(1);
    expect(root.hasAttribute(FONT_FILE_ATTRIBUTE[FontFileKind.CODE])).toBe(true);
    expect(root.hasAttribute(FONT_FILE_ATTRIBUTE[FontFileKind.TEXT])).toBe(false);
    expect(getFontFileStatus(FontFileKind.CODE)).toEqual({ state: 'ready', path: '/f/Mono.ttf' });
  });

  it('puts the built-in font back for null, taking the face away', async () => {
    const { deps, added, deleted, root } = makeDeps();
    await applyFontFile(FontFileKind.TEXT, '/f/Inter.ttf', deps);

    await applyFontFile(FontFileKind.TEXT, null, deps);

    expect(deleted).toEqual(added);
    expect(root.hasAttribute(FONT_FILE_ATTRIBUTE[FontFileKind.TEXT])).toBe(false);
    expect(getFontFileStatus(FontFileKind.TEXT)).toEqual({ state: 'none' });
  });

  it('passes on the backend\'s reason and keeps the built-in font', async () => {
    const { deps, root } = makeDeps({ fetchFont: vi.fn().mockResolvedValue({ status: 'error', code: 'notFound' }) });

    await applyFontFile(FontFileKind.TEXT, '/f/Gone.ttf', deps);

    expect(root.hasAttribute(FONT_FILE_ATTRIBUTE[FontFileKind.TEXT])).toBe(false);
    expect(getFontFileStatus(FontFileKind.TEXT)).toEqual({ state: 'error', path: '/f/Gone.ttf', code: FontFileErrorCode.NOT_FOUND });
  });

  it('calls a file the browser cannot read as a font invalid', async () => {
    const { deps, added } = makeDeps({ createFace: vi.fn((family: string) => fakeFace(family, true)) });

    await applyFontFile(FontFileKind.TEXT, '/f/Fake.ttf', deps);

    expect(added).toHaveLength(0);
    expect(getFontFileStatus(FontFileKind.TEXT)).toMatchObject({ state: 'error', code: FontFileErrorCode.INVALID });
  });

  it('calls a request that got no answer failed', async () => {
    const { deps } = makeDeps({ fetchFont: vi.fn().mockRejectedValue(new Error('timeout')) });

    await applyFontFile(FontFileKind.CODE, '/f/Mono.ttf', deps);

    expect(getFontFileStatus(FontFileKind.CODE)).toMatchObject({ state: 'error', code: FontFileErrorCode.FAILED });
  });

  it('answers a typo without asking the backend', async () => {
    const { deps } = makeDeps();

    await applyFontFile(FontFileKind.CODE, 'fonts/Mono.ttf', deps);

    expect(deps.fetchFont).not.toHaveBeenCalled();
    expect(getFontFileStatus(FontFileKind.CODE)).toMatchObject({ code: FontFileErrorCode.NOT_ABSOLUTE });
  });

  it('lets a newer path win over a slower, older one', async () => {
    let answerOld: (v: unknown) => void = () => {};
    const fetchFont = vi.fn((path: string) =>
      path === '/f/Old.ttf'
        ? new Promise((resolve) => { answerOld = resolve; })
        : Promise.resolve({ status: 'ok', data: 'AAE=', format: 'truetype', size: 2 }),
    ) as FontFileDeps['fetchFont'];
    const { deps, added } = makeDeps({ fetchFont });

    const old = applyFontFile(FontFileKind.TEXT, '/f/Old.ttf', deps);
    await applyFontFile(FontFileKind.TEXT, '/f/New.ttf', deps);
    answerOld({ status: 'ok', data: 'AAE=', format: 'truetype', size: 2 });
    await old;

    expect(added).toHaveLength(1);
    expect(getFontFileStatus(FontFileKind.TEXT)).toEqual({ state: 'ready', path: '/f/New.ttf' });
  });

  it('does not fetch the file in place again, as a reconnect would ask', async () => {
    const { deps } = makeDeps();
    await applyFontFile(FontFileKind.TEXT, '/f/Inter.ttf', deps);

    await applyFontFile(FontFileKind.TEXT, '/f/Inter.ttf', deps);

    expect(deps.fetchFont).toHaveBeenCalledTimes(1);
  });
});

describe('fontFileNote', () => {
  const ready = { state: 'ready', path: '/f/Inter.ttf' } as const;

  it('names the file in use', () => {
    expect(fontFileNote(null, '/f/Inter.ttf', '/f/Inter.ttf', ready)).toEqual({
      key: 'using',
      params: { name: 'Inter.ttf' },
      warn: false,
    });
  });

  it('warns about a typo before anything else', () => {
    expect(fontFileNote(FontFileErrorCode.UNSUPPORTED, '/f/Inter.ttf', '/f/Inter.ttf', ready)).toEqual({
      key: 'errors.unsupported',
      warn: true,
    });
  });

  it('says nothing of a file that is not the one this tab holds', () => {
    // The global tab, while a project uses a file of its own.
    expect(fontFileNote(null, '/f/Inter.ttf', '/p/Other.ttf', ready)).toBeNull();
    expect(fontFileNote(null, '', null, { state: 'none' })).toBeNull();
  });

  it('passes on why the file is not in use', () => {
    expect(
      fontFileNote(null, '/f/Gone.ttf', '/f/Gone.ttf', { state: 'error', path: '/f/Gone.ttf', code: FontFileErrorCode.NOT_FOUND }),
    ).toEqual({ key: 'errors.notFound', warn: true });
  });
});
