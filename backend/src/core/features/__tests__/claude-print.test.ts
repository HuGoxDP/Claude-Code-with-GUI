import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { existsSync, readFileSync } from 'fs';
import type { ChildProcess } from 'child_process';

vi.mock('../../claude', () => ({
  Claude: {
    spawnAuthed: vi.fn(),
    killTree: vi.fn(),
  },
}));

import { Claude } from '../../claude';
import {
  buildClaudePrintArgs,
  modelArg,
  parseClaudePrintOutput,
  runClaudePrint,
  shellArg,
} from '../claude-print';

const ok = (result: string) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result });

interface FakeProc {
  proc: ChildProcess;
  stdinText: () => string;
  finish: (stdout: string, stderr?: string) => void;
}

function fakeProc(): FakeProc {
  const proc = new EventEmitter() as unknown as ChildProcess & EventEmitter;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  let written = '';
  stdin.on('data', (chunk: Buffer) => { written += chunk.toString(); });
  Object.assign(proc, { stdout, stderr, stdin, pid: 1234, exitCode: null, signalCode: null });
  return {
    proc,
    stdinText: () => written,
    finish: (out, err = '') => {
      stdout.write(out);
      if (err) stderr.write(err);
      // Let the data events land before 'close', as a real pipe would.
      setImmediate(() => proc.emit('close', 0));
    },
  };
}

describe('shellArg', () => {
  it('leaves values alone outside Windows', () => {
    expect(shellArg('', 'linux')).toBe('');
    expect(shellArg('/tmp/a b/x.txt', 'darwin')).toBe('/tmp/a b/x.txt');
  });

  it('quotes empty values and values with spaces for cmd.exe', () => {
    expect(shellArg('', 'win32')).toBe('""');
    expect(shellArg('C:\\Users\\Jane Doe\\x.txt', 'win32')).toBe('"C:\\Users\\Jane Doe\\x.txt"');
    expect(shellArg('C:\\tmp\\x.txt', 'win32')).toBe('C:\\tmp\\x.txt');
  });
});

describe('modelArg', () => {
  it('passes aliases, ids and context suffixes', () => {
    expect(modelArg('sonnet')).toBe('sonnet');
    expect(modelArg('claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(modelArg('claude-opus-5-5[1m]')).toBe('claude-opus-5-5[1m]');
  });

  it('drops default, empty values and anything that is not a model id', () => {
    expect(modelArg('default')).toBeNull();
    expect(modelArg('')).toBeNull();
    expect(modelArg(null)).toBeNull();
    expect(modelArg('sonnet && rm -rf /')).toBeNull();
  });
});

describe('buildClaudePrintArgs', () => {
  const files = { systemPromptFile: '/t/sp.txt', settingsFile: '/t/s.json' };

  it('turns off tools, MCP servers, skills, hooks and persistence', () => {
    const args = buildClaudePrintArgs(files, null, 'linux');
    expect(args).toEqual([
      '-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config',
      '--disable-slash-commands', '--tools', '', '--system-prompt-file', '/t/sp.txt',
      '--settings', '/t/s.json',
    ]);
  });

  it('adds --model only for a usable model', () => {
    expect(buildClaudePrintArgs(files, 'haiku', 'linux').slice(-2)).toEqual(['--model', 'haiku']);
    expect(buildClaudePrintArgs(files, 'default', 'linux')).not.toContain('--model');
  });

  it('keeps every argument one token on Windows', () => {
    const args = buildClaudePrintArgs({ systemPromptFile: 'C:\\A B\\sp.txt', settingsFile: 'C:\\A B\\s.json' }, null, 'win32');
    expect(args[args.indexOf('--tools') + 1]).toBe('""');
    expect(args[args.indexOf('--system-prompt-file') + 1]).toBe('"C:\\A B\\sp.txt"');
    // Nothing unquoted carries a space, so a plain join cannot split it.
    for (const arg of args) {
      if (!arg.startsWith('"')) expect(arg).not.toMatch(/\s/);
    }
  });
});

describe('parseClaudePrintOutput', () => {
  it('reads the result line, even after other lines', () => {
    expect(parseClaudePrintOutput(`{"type":"system"}\n${ok('Hello')}\n`)).toBe('Hello');
  });

  it('treats is_error as a failure even with subtype success', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' });
    expect(() => parseClaudePrintOutput(line)).toThrow('Invalid API key · Please run /login');
  });

  it('reports stderr when there is no result at all', () => {
    expect(() => parseClaudePrintOutput('', 'spawn claude ENOENT')).toThrow('spawn claude ENOENT');
  });
});

describe('runClaudePrint', () => {
  beforeEach(() => {
    vi.mocked(Claude.spawnAuthed).mockReset();
    vi.mocked(Claude.killTree).mockReset();
  });

  it('sends the prompt on stdin and the instructions in a file, then cleans the file up', async () => {
    const fake = fakeProc();
    let systemPromptPath = '';
    let systemPromptText = '';
    let settingsText = '';
    vi.mocked(Claude.spawnAuthed).mockImplementation(async (args) => {
      systemPromptPath = args[args.indexOf('--system-prompt-file') + 1] as string;
      systemPromptText = readFileSync(systemPromptPath, 'utf8');
      settingsText = readFileSync(args[args.indexOf('--settings') + 1] as string, 'utf8');
      setImmediate(() => fake.finish(ok('Rewritten')));
      return fake.proc;
    });

    const answer = await runClaudePrint({
      prompt: 'make it better',
      systemPrompt: 'You rewrite prompts.',
      workingDir: '/project',
      model: 'sonnet',
    });

    expect(answer).toBe('Rewritten');
    expect(fake.stdinText()).toBe('make it better');
    expect(systemPromptText).toBe('You rewrite prompts.');
    expect(JSON.parse(settingsText)).toEqual({ disableAllHooks: true });
    expect(existsSync(systemPromptPath)).toBe(false);

    const [args, workingDir, options] = vi.mocked(Claude.spawnAuthed).mock.calls[0]!;
    expect(args).toContain('sonnet');
    // The request text never reaches the command line.
    expect(args.join(' ')).not.toContain('make it better');
    expect(workingDir).toBe('/project');
    expect(options?.cwd).toBe('/project');
  });

  it('rejects with the CLI message on an error result', async () => {
    const fake = fakeProc();
    vi.mocked(Claude.spawnAuthed).mockImplementation(async () => {
      setImmediate(() => fake.finish(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Credit balance is too low' })));
      return fake.proc;
    });
    await expect(runClaudePrint({ prompt: 'x', systemPrompt: 'y' })).rejects.toThrow('Credit balance is too low');
  });

  it('kills the CLI and rejects when it runs past the timeout', async () => {
    const fake = fakeProc();
    vi.mocked(Claude.spawnAuthed).mockResolvedValue(fake.proc);
    await expect(runClaudePrint({ prompt: 'x', systemPrompt: 'y', timeoutMs: 20 })).rejects.toThrow('timed out');
    expect(Claude.killTree).toHaveBeenCalledWith(fake.proc);
  });
});
