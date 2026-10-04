import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Claude } from '../claude';

/**
 * One question to the model, one answer back: `claude -p` with nothing an agent
 * would use. This is the CLI's own print mode, which is how a terminal user gets
 * the same thing (`echo "…" | claude -p --tools ""`), so the GUI depends on no
 * SDK and no undocumented protocol for it.
 *
 * Used by the GUI's small writing helpers (the prompt enhancer, commit messages):
 * they need a rewrite of text the user already has, not a session, so every flag
 * here strips something a session would carry:
 *
 * - `--no-session-persistence` keeps the call out of the session list.
 * - `--tools ""` removes every tool. The answer is text we hand back to the user;
 *   a tool call would only spend time, and an edit would be a side effect nobody
 *   asked for.
 * - `--strict-mcp-config` with no `--mcp-config` starts no MCP server (a `docker
 *   run` server leaves a container behind per start, #363).
 * - `--disable-slash-commands` so text that happens to start with `/` is read as
 *   text, not run as a skill.
 * - `--settings` with `disableAllHooks` so the user's hooks — a Stop hook that
 *   plays a sound, a UserPromptSubmit hook that injects context — do not fire for
 *   what is not a turn of theirs.
 * - `--system-prompt-file` replaces the agent system prompt with the helper's own
 *   instructions; the agent prompt describes tools this call does not have.
 *
 * Every piece of free text travels outside argv: the request on stdin, the
 * instructions and settings in files. On Windows the CLI is spawned through a
 * shell that joins argv with spaces and quotes nothing (`buildWin32CmdLine`), so a
 * sentence or an empty string passed as an argument would arrive in pieces or not
 * at all. The two arguments that remain and could break that way, the empty
 * `--tools` value and the temp paths (a Windows user name may contain a space),
 * are quoted for cmd.exe by {@link shellArg}.
 */

export interface ClaudePrintOptions {
  /** The request, written to the CLI's stdin. */
  prompt: string;
  /** Replaces the agent system prompt. */
  systemPrompt: string;
  /** Project directory: the CLI's cwd and the profile whose credentials it uses. */
  workingDir?: string;
  /**
   * Run the CLI here instead of in [workingDir], which still picks the
   * credentials. For a call that needs nothing from the project, not even its
   * CLAUDE.md.
   */
  cwd?: string;
  /** Passed as `--model` when it is a plain model id or alias. */
  model?: string | null;
  /** Kill the CLI and reject after this long. */
  timeoutMs?: number;
}

export const CLAUDE_PRINT_DEFAULT_TIMEOUT_MS = 120_000;

/**
 * A model value safe to put on the command line. Aliases (`sonnet`), full ids
 * (`claude-opus-5-5`) and context suffixes (`claude-opus-5-5[1m]`) pass; `default`
 * means "whatever the CLI would pick" and is the same as no flag.
 */
export function modelArg(model: string | null | undefined): string | null {
  const value = typeof model === 'string' ? model.trim() : '';
  if (!value || value === 'default') return null;
  return /^[A-Za-z0-9._:[\]-]+$/.test(value) ? value : null;
}

/**
 * One argv element as it must be written for the platform's spawn. POSIX spawns
 * without a shell, so the value goes as is. Windows joins argv into a cmd.exe line
 * unquoted, so an empty value or one with a space is wrapped in double quotes,
 * which cmd passes through and the launcher's argv parser removes. Only for
 * values we produce (paths, the empty string): text with `"`, `%` or `&` is not
 * made safe by this, which is why such text never goes on the command line.
 */
export function shellArg(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return value;
  return value === '' || /\s/.test(value) ? `"${value}"` : value;
}

export function buildClaudePrintArgs(
  files: { systemPromptFile: string; settingsFile: string },
  model?: string | null,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const args = [
    '-p',
    '--output-format',
    'json',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--tools',
    shellArg('', platform),
    '--system-prompt-file',
    shellArg(files.systemPromptFile, platform),
    '--settings',
    shellArg(files.settingsFile, platform),
  ];
  const resolvedModel = modelArg(model);
  if (resolvedModel) args.push('--model', resolvedModel);
  return args;
}

interface PrintResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

/**
 * Read the answer out of `--output-format json` stdout. The result object is the
 * last JSON line (a hook or warning line can precede it). `subtype` alone is not
 * enough: an authentication failure comes back as `subtype: "success"` with
 * `is_error: true` (see fable-probe.ts), so both have to agree before the text is
 * taken as an answer. On failure the CLI puts its message in `result`, which is
 * what the user should read.
 */
export function parseClaudePrintOutput(stdout: string, stderr = ''): string {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  let parsed: PrintResult | null = null;
  for (let i = lines.length - 1; i >= 0 && !parsed; i--) {
    try {
      const candidate = JSON.parse(lines[i] as string) as PrintResult;
      if (candidate && typeof candidate === 'object' && candidate.type === 'result') parsed = candidate;
    } catch {
      // Not the result line.
    }
  }
  if (!parsed) {
    throw new Error(stderr.trim() || stdout.trim() || 'claude returned no result');
  }
  const text = typeof parsed.result === 'string' ? parsed.result : '';
  if (parsed.is_error !== false || parsed.subtype !== 'success') {
    throw new Error(text.trim() || stderr.trim() || 'claude reported an error');
  }
  return text;
}

/** Run one print-mode call and resolve the model's answer text. */
export async function runClaudePrint(options: ClaudePrintOptions): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ccg-print-'));
  try {
    const systemPromptFile = join(dir, 'system-prompt.txt');
    const settingsFile = join(dir, 'settings.json');
    await writeFile(systemPromptFile, options.systemPrompt, 'utf8');
    await writeFile(settingsFile, JSON.stringify({ disableAllHooks: true }), 'utf8');

    const proc = await Claude.spawnAuthed(
      buildClaudePrintArgs({ systemPromptFile, settingsFile }, options.model),
      options.workingDir,
      {
        cwd: options.cwd ?? options.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { TERM: 'dumb', CI: 'true', CLAUDECODE: undefined },
      },
    );

    return await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => settle(() => {
        // On Windows the real CLI is a grandchild of the shell; killTree takes
        // the whole tree down instead of orphaning it.
        Claude.killTree(proc);
        reject(new Error('claude timed out'));
      }), options.timeoutMs ?? CLAUDE_PRINT_DEFAULT_TIMEOUT_MS);
      function settle(fn: () => void): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      }

      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('error', (err) => settle(() => reject(err)));
      proc.on('close', () => settle(() => {
        try {
          resolve(parseClaudePrintOutput(stdout, stderr));
        } catch (err) {
          reject(err);
        }
      }));
      // An EPIPE here means the CLI exited before reading; 'close' reports why.
      proc.stdin?.on('error', () => {});
      proc.stdin?.end(options.prompt, 'utf8');
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
