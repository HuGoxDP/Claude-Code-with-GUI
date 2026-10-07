import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { extname, isAbsolute, join } from 'path';

/**
 * Font files of the user's own for the interface's text and for code (the
 * `textFontFile` / `codeFontFile` settings, ported from CC GUI's custom UI and
 * code font files).
 *
 * The backend only reads the file and hands its bytes to the webview, which
 * registers them as a FontFace. That way the font reaches every client the same
 * way — a JCEF tab, a browser on this machine, or a phone through the tunnel —
 * with no URL to serve and no file path the page would have to open itself.
 */

/** Extensions a FontFace can load, mapped to the format the webview names. */
const FONT_FORMATS: Record<string, FontFileFormat> = {
  '.ttf': 'truetype',
  '.otf': 'opentype',
  '.woff': 'woff',
  '.woff2': 'woff2',
};

export type FontFileFormat = 'truetype' | 'opentype' | 'woff' | 'woff2';

/**
 * The largest file read. Large CJK fonts run to about 20 MB; the bytes travel
 * as base64 in one message, a third larger again.
 */
export const FONT_FILE_MAX_BYTES = 32 * 1024 * 1024;

/** Why a font file cannot be used. The webview words each one for the user. */
export enum FontFileError {
  /** A relative path: relative to what would be a guess. */
  NOT_ABSOLUTE = 'notAbsolute',
  /** Not .ttf, .otf, .woff or .woff2. */
  UNSUPPORTED = 'unsupported',
  /** Nothing there, or a folder. */
  NOT_FOUND = 'notFound',
  /** Over FONT_FILE_MAX_BYTES. */
  TOO_LARGE = 'tooLarge',
  /** There, but it could not be read (permissions, for one). */
  UNREADABLE = 'unreadable',
}

export type FontFileResult =
  | { status: 'ok'; data: string; format: FontFileFormat; size: number }
  | { status: 'error'; code: FontFileError };

/** [path] with a leading `~` standing for the home folder, as a shell would read it. */
export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return path;
}

/** The format [path]'s extension names, or null when no FontFace can load it. */
export function fontFormatOf(path: string): FontFileFormat | null {
  return FONT_FORMATS[extname(path).toLowerCase()] ?? null;
}

/**
 * Why [path] cannot be a font setting's value, without touching the disk; null
 * when it can. The file itself is checked each time it is read, since it can
 * move or change after the setting is saved.
 */
export function checkFontFilePath(path: string): FontFileError | null {
  const expanded = expandHome(path.trim());
  if (!isAbsolute(expanded)) return FontFileError.NOT_ABSOLUTE;
  if (!fontFormatOf(expanded)) return FontFileError.UNSUPPORTED;
  return null;
}

/** Read the font file at [path] for the webview. */
export async function readFontFile(path: string): Promise<FontFileResult> {
  const problem = checkFontFilePath(path);
  if (problem) return { status: 'error', code: problem };
  const expanded = expandHome(path.trim());
  const format = fontFormatOf(expanded) as FontFileFormat;

  let size: number;
  try {
    const info = await stat(expanded);
    if (!info.isFile()) return { status: 'error', code: FontFileError.NOT_FOUND };
    size = info.size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      status: 'error',
      code: code === 'ENOENT' || code === 'ENOTDIR' ? FontFileError.NOT_FOUND : FontFileError.UNREADABLE,
    };
  }
  if (size > FONT_FILE_MAX_BYTES) return { status: 'error', code: FontFileError.TOO_LARGE };

  try {
    const bytes = await readFile(expanded);
    return { status: 'ok', data: bytes.toString('base64'), format, size: bytes.length };
  } catch {
    return { status: 'error', code: FontFileError.UNREADABLE };
  }
}
