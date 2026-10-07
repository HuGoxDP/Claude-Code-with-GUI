import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveClaudeEnvVar } from '../claude-settings';

// Real files in a temporary project: the point is which file each variable lands in.
let project: string;
let base: string;
let local: string;

const read = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));
const write = async (file: string, data: unknown) => writeFile(file, JSON.stringify(data, null, 2));

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'claude-env-'));
  await mkdir(join(project, '.claude'));
  base = join(project, '.claude', 'settings.json');
  local = join(project, '.claude', 'settings.local.json');
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

describe('saveClaudeEnvVar', () => {
  it('adds a new variable to the base file, keeping its other keys and variables', async () => {
    await write(base, { model: 'x', env: { KEEP: '1' } });

    expect(await saveClaudeEnvVar('ANTHROPIC_BASE_URL', 'https://proxy.example', 'project', project)).toEqual({ status: 'ok' });

    expect(await read(base)).toEqual({ model: 'x', env: { KEEP: '1', ANTHROPIC_BASE_URL: 'https://proxy.example' } });
    expect(existsSync(local)).toBe(false);
  });

  it('changes a variable where it already is, in the .local file', async () => {
    await write(base, { env: { SHARED: 'team' } });
    await write(local, { env: { MINE: 'old' } });

    await saveClaudeEnvVar('MINE', 'new', 'project', project);

    expect(await read(local)).toEqual({ env: { MINE: 'new' } });
    expect(await read(base)).toEqual({ env: { SHARED: 'team' } });
  });

  it('removes a variable from both files, and an emptied env block with it', async () => {
    await write(base, { model: 'x', env: { GONE: 'a' } });
    await write(local, { env: { GONE: 'b', STAYS: 'c' } });

    await saveClaudeEnvVar('GONE', null, 'project', project);

    expect(await read(base)).toEqual({ model: 'x' });
    expect(await read(local)).toEqual({ env: { STAYS: 'c' } });
  });

  it('keeps an empty string as a value, as the CLI does', async () => {
    await saveClaudeEnvVar('EMPTY', '', 'project', project);
    expect(await read(base)).toEqual({ env: { EMPTY: '' } });
  });

  it('writes to the user settings for the global scope', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'claude-config-'));
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
    try {
      await saveClaudeEnvVar('USER_LEVEL', 'yes', 'global');
      expect(await read(join(configDir, 'settings.json'))).toEqual({ env: { USER_LEVEL: 'yes' } });
    } finally {
      if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previous;
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('refuses a name a process cannot carry, and touches nothing', async () => {
    for (const name of ['1ST', 'HAS SPACE', 'A-B', '']) {
      const result = await saveClaudeEnvVar(name, 'v', 'project', project);
      expect(result.status, name).toBe('error');
    }
    expect(existsSync(base)).toBe(false);
  });

  it('refuses to write over a file it cannot read', async () => {
    await writeFile(local, '{ not json');
    const result = await saveClaudeEnvVar('X', 'v', 'project', project);
    expect(result.status).toBe('error');
    expect(existsSync(base)).toBe(false);
  });
});
