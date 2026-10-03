import { realpathSync } from 'fs';
import { isAbsolute, resolve } from 'path';

/**
 * The one spelling of a project directory that is stored in a `cwd` column and
 * compared against it.
 *
 * Every entity carries a `cwd`, and rows are found again by comparing it with the
 * directory a project is opened from. Two spellings of the same folder would
 * split one project's rows in two, so the spelling is settled here, before
 * anything is written, and the same function is used when reading.
 *
 * - Relative paths are refused. They resolve against whatever directory the
 *   process happens to be in, which says nothing about a project.
 * - `..`, doubled separators and a trailing separator are removed.
 * - Symbolic links are followed, and on a case-insensitive filesystem the
 *   on-disk spelling is used, so `/tmp/x` and `/private/tmp/X` agree.
 * - A directory that no longer exists keeps its resolved spelling rather than
 *   failing: rows belonging to a deleted or unmounted project must stay
 *   addressable.
 * - On Windows the drive letter is upper-cased.
 */
export function normalizeCwd(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new Error('cwd must not be empty');
  if (!isAbsolute(trimmed)) throw new Error(`cwd must be an absolute path, got "${input}"`);

  let normalized = resolve(trimmed);
  try {
    normalized = realpathSync.native(normalized);
  } catch {
    // The directory is gone, or is on a drive that is not mounted right now.
  }

  if (process.platform === 'win32') {
    normalized = normalized.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
  }
  return normalized;
}
