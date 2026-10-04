import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';
import { readJsonFileSafe } from './claude-settings';
import { updateJsonFile } from './atomic-json';
import { resolveWslCwd } from '../wsl-path';

/**
 * The GUI's `/skills`: the user's and the project's skills, and how much of each
 * the model and the slash menu get to see.
 *
 * Visibility is the CLI's own `skillOverrides` setting, keyed by skill name. Its
 * schema (read from the CLI) is `"on" | "name-only" | "user-invocable-only" |
 * "off"`, absent meaning "on":
 *
 * - `name-only` lists the skill to the model without its description,
 * - `user-invocable-only` hides it from the model but keeps `/name`,
 * - `off` hides it from both.
 *
 * Skills themselves are folders the CLI documents: `<config>/skills/<name>/SKILL.md`
 * for the user and `<project>/.claude/skills/<name>/SKILL.md` for the project. A
 * skill that is off is missing from the CLI's own command list, so the folders are
 * read here rather than taken from that list.
 */

export const SKILL_STATES = ['on', 'name-only', 'user-invocable-only', 'off'] as const;
export type SkillState = (typeof SKILL_STATES)[number];

export function isSkillState(value: unknown): value is SkillState {
  return typeof value === 'string' && (SKILL_STATES as readonly string[]).includes(value);
}

export type SkillScope = 'user' | 'project';
/** Which settings file decides a skill's state. `null` = none does, so it is "on". */
export type SkillStateSource = 'local' | 'project' | 'user' | null;

export interface SkillEntry {
  /** What `skillOverrides` is keyed by and what `/name` runs: frontmatter `name`, else the folder name. */
  name: string;
  /** The folder under `skills/`. */
  directory: string;
  scope: SkillScope;
  /** Absolute path of SKILL.md. */
  path: string;
  description: string | null;
  /** The frontmatter block as written, without the `---` lines; null when there is none. */
  frontmatter: string | null;
  state: SkillState;
  stateSource: SkillStateSource;
}

/** Remove one pair of matching quotes around a YAML scalar. */
function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Read `name` and `description` from a SKILL.md frontmatter.
 *
 * Only what the list needs, from the simple shapes skills are written in: a plain
 * or quoted scalar, or a `|` / `>` block. The frontmatter itself is handed on
 * untouched, so nothing is lost to this reader's limits.
 */
export function parseSkillFrontmatter(text: string): { frontmatter: string | null; name: string | null; description: string | null } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(text);
  if (!match) return { frontmatter: null, name: null, description: null };
  const frontmatter = match[1] as string;
  const lines = frontmatter.split(/\r?\n/);
  const fields: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!field) continue;
    const key = field[1] as string;
    const rest = (field[2] as string).trim();
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1] as string) || (lines[i + 1] as string).trim() === '')) {
        block.push((lines[++i] as string).trim());
      }
      fields[key] = rest.startsWith('|') ? block.join('\n').trim() : block.join(' ').replace(/\s+/g, ' ').trim();
    } else {
      fields[key] = unquote(rest);
    }
  }
  return {
    frontmatter,
    name: fields.name ? fields.name : null,
    description: fields.description ? fields.description : null,
  };
}

async function scanSkillsDir(root: string, scope: SkillScope): Promise<Omit<SkillEntry, 'state' | 'stateSource'>[]> {
  if (!existsSync(root)) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: Omit<SkillEntry, 'state' | 'stateSource'>[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const path = join(root, entry.name, 'SKILL.md');
    if (!existsSync(path)) continue;
    let text = '';
    try {
      text = await readFile(path, 'utf8');
    } catch {
      // Listed by its folder name; the file may be readable later.
    }
    const parsed = parseSkillFrontmatter(text);
    skills.push({
      name: parsed.name ?? entry.name,
      directory: entry.name,
      scope,
      path,
      description: parsed.description,
      frontmatter: parsed.frontmatter,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export interface SkillSettingsFiles {
  user: string;
  project: string | null;
  local: string | null;
}

export function skillSettingsFiles(workingDir?: string | null): SkillSettingsFiles {
  const project = workingDir ? ((resolveWslCwd(workingDir) as string) ?? workingDir) : null;
  return {
    user: join(getClaudeConfigDir(), 'settings.json'),
    project: project ? join(project, '.claude', 'settings.json') : null,
    local: project ? join(project, '.claude', 'settings.local.json') : null,
  };
}

function overridesOf(settings: Record<string, unknown>): Record<string, unknown> {
  const value = settings.skillOverrides;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

interface OverrideLayers {
  local: Record<string, unknown>;
  project: Record<string, unknown>;
  user: Record<string, unknown>;
}

async function readOverrideLayers(files: SkillSettingsFiles): Promise<OverrideLayers> {
  const [user, project, local] = await Promise.all([
    readJsonFileSafe(files.user),
    files.project ? readJsonFileSafe(files.project) : Promise.resolve({}),
    files.local ? readJsonFileSafe(files.local) : Promise.resolve({}),
  ]);
  return { user: overridesOf(user), project: overridesOf(project), local: overridesOf(local) };
}

/**
 * The state the CLI uses: the local setting, else the project one, else the
 * user one, else "on". A value outside the schema is skipped, as the CLI would
 * not accept it either.
 */
export function resolveSkillState(name: string, layers: OverrideLayers): { state: SkillState; source: SkillStateSource } {
  for (const source of ['local', 'project', 'user'] as const) {
    const value = layers[source][name];
    if (isSkillState(value)) return { state: value, source };
  }
  return { state: 'on', source: null };
}

/** Every user and project skill with its current state. */
export async function listSkills(workingDir?: string | null): Promise<SkillEntry[]> {
  const files = skillSettingsFiles(workingDir);
  const projectRoot = files.project ? join(files.project, '..', 'skills') : null;
  const [userSkills, projectSkills, layers] = await Promise.all([
    scanSkillsDir(join(getClaudeConfigDir(), 'skills'), 'user'),
    projectRoot ? scanSkillsDir(projectRoot, 'project') : Promise.resolve([]),
    readOverrideLayers(files),
  ]);
  return [...projectSkills, ...userSkills].map((skill) => {
    const { state, source } = resolveSkillState(skill.name, layers);
    return { ...skill, state, stateSource: source };
  });
}

/**
 * Which file a change goes to, so that it takes effect and never edits the
 * project's shared, committed settings.
 *
 * The CLI's own advice is the default: a project skill's override goes in the
 * project's `settings.local.json`, a user skill's in the user `settings.json`.
 * When a project file already decides the state, the change goes to
 * `settings.local.json`, the one layer above it, rather than into the shared
 * `.claude/settings.json` the whole team reads.
 */
export function targetFileFor(scope: SkillScope, source: SkillStateSource, files: SkillSettingsFiles): string {
  if (files.local && (scope === 'project' || source === 'local' || source === 'project')) return files.local;
  return files.user;
}

/**
 * Set a skill's state.
 *
 * The override is removed rather than written when the layers below already give
 * that state (usually "on", which absent means), so the user's file only holds
 * what it has to. When a lower layer says otherwise, the state is written out,
 * "on" included, because only an explicit value can overrule it.
 */
export async function setSkillState(
  workingDir: string | null | undefined,
  skill: { name: string; scope: SkillScope },
  state: SkillState,
): Promise<{ status: 'ok'; file: string } | { status: 'error'; error: string }> {
  const files = skillSettingsFiles(workingDir);
  const layers = await readOverrideLayers(files);
  const { source } = resolveSkillState(skill.name, layers);
  const file = targetFileFor(skill.scope, source, files);
  const targetLayer: keyof OverrideLayers = file === files.local ? 'local' : 'user';

  const below: OverrideLayers = { ...layers, [targetLayer]: {} };
  if (targetLayer === 'user') {
    // Nothing sits under the user file.
    below.local = {};
    below.project = {};
  }
  const removeIsEnough = resolveSkillState(skill.name, below).state === state;

  const result = await updateJsonFile(file, (current) => {
    const overrides = { ...overridesOf(current) };
    if (removeIsEnough) {
      if (!(skill.name in overrides)) return null;
      delete overrides[skill.name];
    } else {
      if (overrides[skill.name] === state) return null;
      overrides[skill.name] = state;
    }
    const next = { ...current };
    if (Object.keys(overrides).length === 0) delete next.skillOverrides;
    else next.skillOverrides = overrides;
    return next;
  });
  return result.status === 'ok' ? { status: 'ok', file } : result;
}
