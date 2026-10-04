import { execFile } from 'child_process';
import { existsSync, realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { promisify } from 'util';
import { resolveWslCwd } from '../wsl-path';
import { runClaudePrint } from './claude-print';

const execFileAsync = promisify(execFile);

/**
 * Write a commit message for the changes about to be committed.
 *
 * The diff comes from `git` itself and the message from one `claude -p` call
 * (claude-print.ts), so this is what a terminal user gets by piping
 * `git diff HEAD` into `claude -p`. The IDE only names which files are in the
 * commit; everything else happens here, because the backend is the only place
 * with business logic.
 */

/** Total diff characters handed to the model. Past this, each file's diff is cut. */
export const MAX_DIFF_CHARS = 60_000;
/** A cut file keeps at least this much, so its header and first hunk survive. */
export const MIN_FILE_DIFF_CHARS = 1_500;
/** An untracked file contributes at most this much of its content. */
export const MAX_NEW_FILE_CHARS = 4_000;
/** How many recent subjects are shown to the model as the project's style. */
export const RECENT_SUBJECTS = 10;
/** Paths per git call, so a large commit never hits the Windows command-line limit. */
const PATHS_PER_CALL = 100;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/** Why there is nothing to describe. Sent to the caller as the error text. */
export const CommitMessageError = {
  NotARepository: 'not-a-repository',
  NoChanges: 'no-changes',
  EmptyResult: 'empty-result',
} as const;

/** Which changes were described: the ones named, the staged ones, or everything. */
export type CommitScope = 'selected' | 'staged' | 'all';

export interface CommitChanges {
  gitRoot: string;
  scope: CommitScope;
  /** `git diff --stat` for the whole scope; never cut, so every file is named. */
  stat: string;
  /** The unified diff, cut per file to fit {@link MAX_DIFF_CHARS}. */
  diff: string;
  /** Untracked files in scope, which `git diff` does not show. */
  newFiles: string[];
}

export const COMMIT_SYSTEM_PROMPT = [
  'You write git commit messages. You receive the changes about to be committed and reply with one commit message for them.',
  '',
  'Format:',
  '- A subject line in the imperative mood ("Add", "Fix", not "Added"), at most 72 characters, no trailing period.',
  '- When the change has more than one logical part, a blank line and then a body that says what changed and why, as short "- " bullets naming the main files or areas. Do not retell the diff line by line.',
  '- Wrap body lines at 72 characters.',
  '- Match the style of the repository\'s recent subjects when they are given: their language, prefixes such as "feat:" or "fix(scope):", capitalisation and tone. With no recent subjects, write in English with a plain subject.',
  '- When the project\'s instructions (CLAUDE.md) say how commit messages are written, follow them; they win over everything above.',
  '',
  'Output rules:',
  '- Wrap the whole message in <commit></commit> and write nothing outside the tags.',
  '- No analysis, no explanation, no "Generated with" or "Co-Authored-By" lines, no emoji unless the recent subjects use them.',
].join('\n');

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['--no-pager', '--literal-pathspecs', ...args], {
    cwd,
    maxBuffer: GIT_MAX_BUFFER,
    encoding: 'utf8',
    windowsHide: true,
  });
  return stdout;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run a git command once per batch of paths and join the output. */
async function gitForPaths(cwd: string, args: string[], paths: string[] | null): Promise<string> {
  if (!paths) return git(cwd, args);
  const parts: string[] = [];
  for (const batch of chunk(paths, PATHS_PER_CALL)) {
    parts.push(await git(cwd, [...args, '--', ...batch]));
  }
  return parts.join('');
}

/**
 * Turn the IDE's absolute paths into pathspecs relative to the repository root.
 * Paths outside the repository are dropped: git would reject the whole command
 * for one of them. A WSL project's `//wsl.localhost/...` path is translated the
 * same way a spawn cwd is.
 */
export function toRepoPaths(gitRoot: string, paths: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of paths) {
    if (typeof raw !== 'string' || !raw) continue;
    const local = (resolveWslCwd(raw) as string) ?? raw;
    const rel = relative(resolve(gitRoot), resolve(local)).split('\\').join('/');
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
    seen.add(rel);
  }
  return [...seen];
}

/**
 * Cut a long diff so every file keeps a share. Splitting by file rather than
 * cutting the end keeps the last files from disappearing behind a lockfile.
 */
export function fitDiff(diff: string, max = MAX_DIFF_CHARS): string {
  if (diff.length <= max) return diff;
  const blocks = diff.split(/(?=^diff --git )/m).filter(Boolean);
  const share = Math.max(MIN_FILE_DIFF_CHARS, Math.floor(max / Math.max(1, blocks.length)));
  const cut = blocks.map((block) => (block.length <= share
    ? block
    : `${block.slice(0, share)}\n[… ${block.length - share} more characters of this file's diff left out]\n`));
  const joined = cut.join('');
  if (joined.length <= max) return joined;
  const kept: string[] = [];
  let size = 0;
  for (const block of cut) {
    if (size + block.length > max) break;
    kept.push(block);
    size += block.length;
  }
  return `${kept.join('')}\n[… ${cut.length - kept.length} more files left out; the stat above lists them]\n`;
}

async function describeNewFile(gitRoot: string, rel: string): Promise<string> {
  try {
    const buf = await readFile(resolve(gitRoot, rel));
    if (buf.includes(0)) return `new file: ${rel} (binary, ${buf.length} bytes)\n`;
    // The final newline ends the last line; it is not one more empty line.
    const text = buf.toString('utf8').replace(/\r?\n$/, '');
    const shown = text.length > MAX_NEW_FILE_CHARS ? `${text.slice(0, MAX_NEW_FILE_CHARS)}\n[… ${text.length - MAX_NEW_FILE_CHARS} more characters]` : text;
    return `new file: ${rel}\n${shown.split('\n').map((line) => `+${line}`).join('\n')}\n`;
  } catch {
    return `new file: ${rel}\n`;
  }
}

async function gitRootOf(dir: string): Promise<string | null> {
  try {
    return (await git(dir, ['rev-parse', '--show-toplevel'])).trim() || null;
  } catch {
    return null;
  }
}

/** The nearest existing folder at or above `path`: a deleted file's folder may be gone too. */
function existingDirOf(path: string): string {
  let dir = dirname(path);
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

/**
 * `path` with symlinks resolved, as git reports paths. `git rev-parse
 * --show-toplevel` answers with the real path, so a project opened through a
 * link (or a macOS temp folder under `/var`, which is `/private/var`) would
 * otherwise look like it lies outside its own repository. A path that no longer
 * exists keeps its missing tail on top of its nearest existing folder.
 */
function realPathOf(path: string): string {
  const dir = existingDirOf(path);
  let realDir = dir;
  try {
    realDir = realpathSync.native(dir);
  } catch {
    // Keep the path as given.
  }
  return join(realDir, relative(dir, path));
}

/**
 * Sort the IDE's paths by the repository each one is in. A project can hold
 * several repositories (IntelliJ shows them as separate VCS roots in one commit
 * dialog), so the project folder is not necessarily a repository itself. Paths
 * in no repository are dropped.
 */
export async function groupByRepository(paths: string[]): Promise<Map<string, string[]>> {
  const rootOfDir = new Map<string, Promise<string | null>>();
  const groups = new Map<string, string[]>();
  for (const raw of paths) {
    if (typeof raw !== 'string' || !raw) continue;
    const local = realPathOf(resolve((resolveWslCwd(raw) as string) ?? raw));
    const dir = existingDirOf(local);
    if (!rootOfDir.has(dir)) rootOfDir.set(dir, gitRootOf(dir));
    const root = await rootOfDir.get(dir);
    if (!root) continue;
    const list = groups.get(root) ?? [];
    list.push(local);
    groups.set(root, list);
  }
  return groups;
}

interface RepositoryChanges {
  stat: string;
  diff: string;
  newFiles: string[];
}

const DIFF_ARGS = ['diff', '--no-color', '--no-ext-diff', '-M'];

async function diffAgainst(gitRoot: string, against: string[], pathspecs: string[] | null, withUntracked: boolean): Promise<RepositoryChanges> {
  const [stat, diff, untracked] = await Promise.all([
    gitForPaths(gitRoot, [...DIFF_ARGS, '--stat', ...against], pathspecs),
    gitForPaths(gitRoot, [...DIFF_ARGS, ...against], pathspecs),
    withUntracked ? gitForPaths(gitRoot, ['ls-files', '--others', '--exclude-standard'], pathspecs) : Promise.resolve(''),
  ]);
  const newFiles = untracked.split('\n').map((line) => line.trim()).filter(Boolean);
  const newFileText = (await Promise.all(newFiles.map((rel) => describeNewFile(gitRoot, rel)))).join('');
  return { stat: stat.trim(), diff: diff + newFileText, newFiles };
}

/** HEAD when there is one; before the first commit, the index is all there is to compare with. */
async function baseOf(gitRoot: string): Promise<string[]> {
  const hasHead = await git(gitRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(() => true, () => false);
  return hasHead ? ['HEAD'] : ['--cached'];
}

/**
 * Gather the changes to describe.
 *
 * With `paths` (the IDE's commit dialog), exactly those files, against HEAD:
 * the dialog commits what is in the working tree whether or not it is staged.
 * Files from several repositories are described together, each under its
 * repository's name.
 *
 * Without paths, what `git commit` in `workingDir` would commit: the staged
 * changes when there are any, otherwise every change including untracked files.
 */
export async function collectCommitChanges(workingDir: string, paths?: string[] | null): Promise<CommitChanges> {
  if (paths && paths.length > 0) {
    const groups = await groupByRepository(paths);
    if (groups.size === 0) {
      const cwd = (resolveWslCwd(workingDir) as string) ?? workingDir;
      throw new Error((await gitRootOf(cwd)) ? CommitMessageError.NoChanges : CommitMessageError.NotARepository);
    }

    // The repository with the most files leads: its history sets the style.
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const several = ordered.length > 1;
    const stats: string[] = [];
    const diffs: string[] = [];
    const newFiles: string[] = [];
    for (const [root, list] of ordered) {
      const pathspecs = toRepoPaths(root, list);
      if (pathspecs.length === 0) continue;
      const changes = await diffAgainst(root, await baseOf(root), pathspecs, true);
      if (!changes.diff.trim()) continue;
      const label = several ? `# repository: ${basename(root)}\n` : '';
      if (changes.stat) stats.push(label + changes.stat);
      diffs.push(label + changes.diff);
      newFiles.push(...changes.newFiles);
    }
    if (diffs.length === 0) throw new Error(CommitMessageError.NoChanges);
    return {
      gitRoot: (ordered[0] as [string, string[]])[0],
      scope: 'selected',
      stat: stats.join('\n\n'),
      diff: fitDiff(diffs.join('\n')),
      newFiles,
    };
  }

  const cwd = (resolveWslCwd(workingDir) as string) ?? workingDir;
  const gitRoot = await gitRootOf(cwd);
  if (!gitRoot) throw new Error(CommitMessageError.NotARepository);

  const stagedNames = (await git(gitRoot, ['diff', '--cached', '--name-only'])).trim();
  const scope: CommitScope = stagedNames ? 'staged' : 'all';
  const changes = scope === 'staged'
    ? await diffAgainst(gitRoot, ['--cached'], null, false)
    : await diffAgainst(gitRoot, await baseOf(gitRoot), null, true);
  if (!changes.diff.trim()) throw new Error(CommitMessageError.NoChanges);
  return { gitRoot, scope, stat: changes.stat, diff: fitDiff(changes.diff), newFiles: changes.newFiles };
}

/** The latest subjects, so the message can follow the project's own style. */
export async function recentSubjects(gitRoot: string, count = RECENT_SUBJECTS): Promise<string[]> {
  try {
    const out = await git(gitRoot, ['log', `-n${count}`, '--no-merges', '--format=%s']);
    return out.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    // No commits yet.
    return [];
  }
}

export function buildCommitMessageRequest(input: {
  changes: CommitChanges;
  subjects: string[];
  draft?: string | null;
}): string {
  const parts: string[] = [];
  if (input.subjects.length > 0) {
    parts.push(`<recent-subjects>\n${input.subjects.join('\n')}\n</recent-subjects>`);
  }
  const draft = input.draft?.trim();
  if (draft) {
    parts.push(`<draft-message>\n${draft}\n</draft-message>\nThe author started this message; keep what it says and improve it.`);
  }
  if (input.changes.stat) parts.push(`<stat>\n${input.changes.stat}\n</stat>`);
  parts.push(`<diff>\n${input.changes.diff}\n</diff>`);
  return parts.join('\n\n');
}

/**
 * Take the message out of the model's answer: the `<commit>` tags it was told to
 * use, else the first code fence, else the whole answer. Literal `\n` sequences
 * become line breaks, and runs of blank lines collapse to one.
 */
export function cleanCommitMessage(text: string): string {
  let out = text.trim();
  const tagged = /<commit>([\s\S]*?)<\/commit>/i.exec(out);
  if (tagged) {
    out = (tagged[1] as string).trim();
  } else {
    const fence = /```[^\n]*\n([\s\S]*?)```/.exec(out);
    if (fence) out = (fence[1] as string).trim();
  }
  if (!out.includes('\n') && out.includes('\\n')) out = out.replace(/\\n/g, '\n');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export interface GenerateCommitMessageOptions {
  workingDir: string;
  /** Files in the commit, as absolute paths. Omit for "what `git commit` would commit". */
  paths?: string[] | null;
  /** What the author already typed in the commit message box. */
  draft?: string | null;
  model?: string | null;
}

export async function generateCommitMessage(
  options: GenerateCommitMessageOptions,
): Promise<{ message: string; scope: CommitScope }> {
  const changes = await collectCommitChanges(options.workingDir, options.paths);
  const subjects = await recentSubjects(changes.gitRoot);
  const answer = await runClaudePrint({
    prompt: buildCommitMessageRequest({ changes, subjects, draft: options.draft }),
    systemPrompt: COMMIT_SYSTEM_PROMPT,
    workingDir: options.workingDir,
    model: options.model,
  });
  const message = cleanCommitMessage(answer);
  if (!message) throw new Error(CommitMessageError.EmptyResult);
  return { message, scope: changes.scope };
}
