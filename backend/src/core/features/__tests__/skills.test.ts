import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  listSkills,
  parseSkillFrontmatter,
  resolveSkillState,
  setSkillState,
  skillSettingsFiles,
  targetFileFor,
} from '../skills';

let root: string;
let configDir: string;
let project: string;
let savedConfigDir: string | undefined;

function writeSkill(base: string, dir: string, frontmatter: string | null, body = 'Do the thing.'): void {
  mkdirSync(join(base, dir), { recursive: true });
  writeFileSync(join(base, dir, 'SKILL.md'), frontmatter === null ? body : `---\n${frontmatter}\n---\n${body}\n`);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ccg-skills-'));
  configDir = join(root, 'config');
  project = join(root, 'project');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(project, { recursive: true });
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
});

afterEach(() => {
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  rmSync(root, { recursive: true, force: true });
});

describe('parseSkillFrontmatter', () => {
  it('reads plain and quoted fields', () => {
    expect(parseSkillFrontmatter('---\nname: "release-notes"\ndescription: Writes release notes.\n---\nBody'))
      .toEqual({ frontmatter: 'name: "release-notes"\ndescription: Writes release notes.', name: 'release-notes', description: 'Writes release notes.' });
  });

  it('reads a block description', () => {
    const text = '---\nname: x\ndescription: >\n  Folded over\n  two lines.\nallowed-tools: Read\n---\n';
    expect(parseSkillFrontmatter(text).description).toBe('Folded over two lines.');
  });

  it('copes with no frontmatter at all', () => {
    expect(parseSkillFrontmatter('Just instructions.')).toEqual({ frontmatter: null, name: null, description: null });
  });
});

describe('resolveSkillState', () => {
  it('takes local over project over user, and "on" when nothing says otherwise', () => {
    expect(resolveSkillState('a', { local: {}, project: {}, user: {} })).toEqual({ state: 'on', source: null });
    expect(resolveSkillState('a', { local: {}, project: { a: 'off' }, user: { a: 'name-only' } })).toEqual({ state: 'off', source: 'project' });
    expect(resolveSkillState('a', { local: { a: 'on' }, project: { a: 'off' }, user: {} })).toEqual({ state: 'on', source: 'local' });
  });

  it('skips values the CLI would not accept', () => {
    expect(resolveSkillState('a', { local: { a: 'disabled' }, project: {}, user: { a: 'off' } })).toEqual({ state: 'off', source: 'user' });
  });
});

describe('targetFileFor', () => {
  const files = { user: '/c/settings.json', project: '/p/.claude/settings.json', local: '/p/.claude/settings.local.json' };

  it('follows the CLI: project skills to settings.local.json, user skills to the user file', () => {
    expect(targetFileFor('project', null, files)).toBe(files.local);
    expect(targetFileFor('user', null, files)).toBe(files.user);
  });

  it('never edits the shared project file, and goes above it when it decides', () => {
    expect(targetFileFor('user', 'project', files)).toBe(files.local);
    expect(targetFileFor('user', 'local', files)).toBe(files.local);
  });

  it('uses the user file when there is no project', () => {
    expect(targetFileFor('user', null, { user: '/c/settings.json', project: null, local: null })).toBe('/c/settings.json');
  });
});

describe('listSkills', () => {
  it('lists project and user skills with their state and where it comes from', async () => {
    writeSkill(join(project, '.claude', 'skills'), 'deploy', 'name: deploy\ndescription: Ships it.');
    writeSkill(join(configDir, 'skills'), 'notes-dir', 'name: notes\ndescription: Takes notes.');
    writeSkill(join(configDir, 'skills'), 'bare', null);
    mkdirSync(join(configDir, 'skills', 'not-a-skill'), { recursive: true });
    writeJson(join(configDir, 'settings.json'), { skillOverrides: { notes: 'name-only' } });
    writeJson(join(project, '.claude', 'settings.local.json'), { skillOverrides: { deploy: 'off' } });

    const skills = await listSkills(project);
    expect(skills.map((s) => [s.name, s.scope, s.state, s.stateSource])).toEqual([
      ['deploy', 'project', 'off', 'local'],
      ['bare', 'user', 'on', null],
      ['notes', 'user', 'name-only', 'user'],
    ]);
    expect(skills[2]?.directory).toBe('notes-dir');
    expect(skills[2]?.path).toBe(join(configDir, 'skills', 'notes-dir', 'SKILL.md'));
  });

  it('lists only user skills without a project', async () => {
    writeSkill(join(configDir, 'skills'), 'a', 'name: a');
    expect((await listSkills(null)).map((s) => s.scope)).toEqual(['user']);
  });
});

describe('setSkillState', () => {
  it('writes a project skill to settings.local.json and keeps the other keys', async () => {
    const local = join(project, '.claude', 'settings.local.json');
    writeJson(local, { permissions: { allow: ['Bash(ls)'] } });
    expect(await setSkillState(project, { name: 'deploy', scope: 'project' }, 'off')).toEqual({ status: 'ok', file: local });
    expect(readJson(local)).toEqual({ permissions: { allow: ['Bash(ls)'] }, skillOverrides: { deploy: 'off' } });
  });

  it('writes a user skill to the user settings', async () => {
    const result = await setSkillState(project, { name: 'notes', scope: 'user' }, 'user-invocable-only');
    expect(result).toEqual({ status: 'ok', file: join(configDir, 'settings.json') });
    expect(readJson(join(configDir, 'settings.json'))).toEqual({ skillOverrides: { notes: 'user-invocable-only' } });
  });

  it('removes the override to turn a skill back on, and the block when it empties', async () => {
    const userFile = join(configDir, 'settings.json');
    writeJson(userFile, { model: 'opus', skillOverrides: { notes: 'off' } });
    await setSkillState(project, { name: 'notes', scope: 'user' }, 'on');
    expect(readJson(userFile)).toEqual({ model: 'opus' });
  });

  it('writes "on" outright when a lower file would keep the skill off', async () => {
    const shared = join(project, '.claude', 'settings.json');
    const local = join(project, '.claude', 'settings.local.json');
    writeJson(shared, { skillOverrides: { deploy: 'off' } });
    writeSkill(join(project, '.claude', 'skills'), 'deploy', 'name: deploy');

    await setSkillState(project, { name: 'deploy', scope: 'project' }, 'on');

    // The team's file is untouched; the local file overrules it.
    expect(readJson(shared)).toEqual({ skillOverrides: { deploy: 'off' } });
    expect(readJson(local)).toEqual({ skillOverrides: { deploy: 'on' } });
    expect((await listSkills(project)).map((x) => [x.state, x.stateSource])).toEqual([['on', 'local']]);
  });

  it('does not create a file just to say what is already true', async () => {
    await setSkillState(project, { name: 'deploy', scope: 'project' }, 'on');
    expect(existsSync(join(project, '.claude', 'settings.local.json'))).toBe(false);
  });

  it('refuses to write over a settings file it cannot read', async () => {
    const userFile = join(configDir, 'settings.json');
    writeFileSync(userFile, '{ "model": "opus", ');
    const result = await setSkillState(project, { name: 'notes', scope: 'user' }, 'off');
    expect(result.status).toBe('error');
    expect(readFileSync(userFile, 'utf8')).toBe('{ "model": "opus", ');
  });
});

describe('skillSettingsFiles', () => {
  it('names the three files the CLI reads', () => {
    expect(skillSettingsFiles(project)).toEqual({
      user: join(configDir, 'settings.json'),
      project: join(project, '.claude', 'settings.json'),
      local: join(project, '.claude', 'settings.local.json'),
    });
  });
});
