import { useSyncExternalStore } from 'react';
import { SettingKey } from '@/types/settings';

/**
 * Font files of the user's own for the interface's text and for code (the
 * `textFontFile` / `codeFontFile` settings, ported from CC GUI's custom UI and
 * code font files).
 *
 * The backend reads the file (GET_FONT_FILE) and this module registers its bytes
 * as a FontFace under a family name of ours. Only once the face has loaded does
 * <html> get the attribute that index.css swaps the font variables on, so a file
 * that is missing or is not a font leaves the built-in fonts exactly as they were.
 */

export enum FontFileKind {
  TEXT = 'text',
  CODE = 'code',
}

/** The family each kind is registered under; index.css names the same two. */
export const FONT_FILE_FAMILY: Record<FontFileKind, string> = {
  [FontFileKind.TEXT]: 'Swttch Text Font',
  [FontFileKind.CODE]: 'Swttch Code Font',
};

/** The setting that names each kind's file. */
export const FONT_FILE_SETTING = {
  [FontFileKind.TEXT]: SettingKey.TEXT_FONT_FILE,
  [FontFileKind.CODE]: SettingKey.CODE_FONT_FILE,
} as const;

/** The attribute on <html> that switches each kind on in index.css. */
export const FONT_FILE_ATTRIBUTE: Record<FontFileKind, string> = {
  [FontFileKind.TEXT]: 'data-text-font',
  [FontFileKind.CODE]: 'data-code-font',
};

/**
 * Why a file is not in use. The first five come from the backend
 * (features/fontFiles.ts); `invalid` is a file the browser could not read as a
 * font, and `failed` a request that got no answer.
 */
export enum FontFileErrorCode {
  NOT_ABSOLUTE = 'notAbsolute',
  UNSUPPORTED = 'unsupported',
  NOT_FOUND = 'notFound',
  TOO_LARGE = 'tooLarge',
  UNREADABLE = 'unreadable',
  INVALID = 'invalid',
  FAILED = 'failed',
}

export type FontFileStatus =
  | { state: 'none' }
  | { state: 'loading'; path: string }
  | { state: 'ready'; path: string }
  | { state: 'error'; path: string; code: FontFileErrorCode };

/** The GET_FONT_FILE reply. */
export type FontFileResponse =
  | { status: 'ok'; data: string; format: string; size: number }
  | { status: 'error'; code?: string; error?: string };

const EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

/**
 * Why [path] cannot be a font file, checked as the backend checks it so a typo
 * is answered in place instead of being saved and refused; null when it can.
 */
export function checkFontFilePath(path: string): FontFileErrorCode | null {
  const p = path.trim();
  const absolute = /^(\/|\\|~[\\/]|[A-Za-z]:[\\/])/.test(p);
  if (!absolute) return FontFileErrorCode.NOT_ABSOLUTE;
  const lower = p.toLowerCase();
  if (!EXTENSIONS.some((ext) => lower.endsWith(ext))) return FontFileErrorCode.UNSUPPORTED;
  return null;
}

/** The file's name, for saying which file is in use. */
export function fontFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** A line under a settings row: a key under `appearance.fontFile`, its values, and whether it warns. */
export interface FontFileNote {
  key: string;
  params?: Record<string, string>;
  warn: boolean;
}

/**
 * What the settings row says under its field. [problem] is a typo caught before
 * saving; [stored] the path in the row's own tab, [effective] the one in force.
 * The load status is of the file in force, so it is shown only when that is the
 * row's own: a project tab's path, say, is not the global one being edited.
 */
export function fontFileNote(
  problem: FontFileErrorCode | null,
  stored: string,
  effective: unknown,
  status: FontFileStatus,
): FontFileNote | null {
  if (problem) return { key: `errors.${problem}`, warn: true };
  if (stored === '' || effective !== stored || status.state === 'none' || status.path !== stored) return null;
  if (status.state === 'ready') return { key: 'using', params: { name: fontFileName(status.path) }, warn: false };
  if (status.state === 'loading') return { key: 'loading', warn: false };
  return { key: `errors.${status.code}`, warn: true };
}

// -- Status store ------------------------------------------------------------

const statuses: Record<FontFileKind, FontFileStatus> = {
  [FontFileKind.TEXT]: { state: 'none' },
  [FontFileKind.CODE]: { state: 'none' },
};
const listeners = new Set<() => void>();

function setStatus(kind: FontFileKind, status: FontFileStatus): void {
  statuses[kind] = status;
  listeners.forEach((listener) => listener());
}

export function getFontFileStatus(kind: FontFileKind): FontFileStatus {
  return statuses[kind];
}

export function subscribeFontFileStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The load status of [kind]'s file, for the settings row. */
export function useFontFileStatus(kind: FontFileKind): FontFileStatus {
  return useSyncExternalStore(subscribeFontFileStatus, () => statuses[kind]);
}

// -- Loading -----------------------------------------------------------------

/** What applying a font needs from the page, injectable for tests. */
export interface FontFileDeps {
  fetchFont: (path: string) => Promise<FontFileResponse | null | undefined>;
  createFace?: (family: string, bytes: ArrayBuffer) => FontFace;
  fonts?: Pick<FontFaceSet, 'add' | 'delete'>;
  root?: HTMLElement;
}

const faces: Partial<Record<FontFileKind, FontFace>> = {};
// Each call takes a ticket; an answer for an older ticket is dropped, so a path
// typed over a slow load never ends up in place of the newer one.
const tickets: Record<FontFileKind, number> = { [FontFileKind.TEXT]: 0, [FontFileKind.CODE]: 0 };

function base64ToBytes(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function clear(kind: FontFileKind, deps: FontFileDeps): void {
  const root = deps.root ?? document.documentElement;
  root.removeAttribute(FONT_FILE_ATTRIBUTE[kind]);
  const face = faces[kind];
  if (face) (deps.fonts ?? document.fonts).delete(face);
  delete faces[kind];
}

/**
 * Put [path]'s font in place for [kind], or the built-in font back for null.
 * Whatever happens, the status store says so.
 */
export async function applyFontFile(kind: FontFileKind, path: string | null, deps: FontFileDeps): Promise<void> {
  // The same file in place or on its way: nothing to do. A reconnect re-runs the
  // caller, and a large font is not worth fetching twice for it.
  const current = statuses[kind];
  if (path && (current.state === 'ready' || current.state === 'loading') && current.path === path) return;

  const ticket = ++tickets[kind];
  if (!path) {
    clear(kind, deps);
    setStatus(kind, { state: 'none' });
    return;
  }

  const fail = (code: FontFileErrorCode) => {
    if (ticket !== tickets[kind]) return;
    clear(kind, deps);
    setStatus(kind, { state: 'error', path, code });
  };

  const problem = checkFontFilePath(path);
  if (problem) return fail(problem);

  setStatus(kind, { state: 'loading', path });
  let response: FontFileResponse | null | undefined;
  try {
    response = await deps.fetchFont(path);
  } catch {
    return fail(FontFileErrorCode.FAILED);
  }
  if (ticket !== tickets[kind]) return;
  if (!response || response.status !== 'ok') {
    const code = Object.values(FontFileErrorCode).find((c) => c === response?.code);
    return fail(code ?? FontFileErrorCode.FAILED);
  }

  let face: FontFace;
  try {
    const bytes = base64ToBytes(response.data);
    const createFace = deps.createFace ?? ((family, buffer) => new FontFace(family, buffer));
    // The bare name: Chrome keeps quotes given here as part of the family's name.
    face = createFace(FONT_FILE_FAMILY[kind], bytes);
    await face.load();
  } catch {
    return fail(FontFileErrorCode.INVALID);
  }
  if (ticket !== tickets[kind]) return;

  clear(kind, deps);
  (deps.fonts ?? document.fonts).add(face);
  faces[kind] = face;
  (deps.root ?? document.documentElement).setAttribute(FONT_FILE_ATTRIBUTE[kind], '');
  setStatus(kind, { state: 'ready', path });
}
