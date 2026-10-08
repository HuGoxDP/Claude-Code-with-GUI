import { readFile, writeFile, rename, unlink, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { EntityChange } from '../entities/AbstractEntityCollection';
import { ApiProviderCollection } from '../entities/provider/ApiProvider.collection';
import { ApiProvider, type ApiProviderFields } from '../entities/provider/ApiProvider.entity';
import { readClaudeSettings, saveClaudeEnvVars } from './claude-settings';

/**
 * API providers: named ways of reaching Claude through another endpoint, ported
 * from CC GUI's API provider manager.
 *
 * A terminal user does this with documented variables in the `env` block of
 * ~/.claude/settings.json: ANTHROPIC_BASE_URL, a key in ANTHROPIC_AUTH_TOKEN or
 * ANTHROPIC_API_KEY, and the models for Claude Code's slots. Using a provider
 * writes exactly those (and removes the ones it does not set), so the CLI reads
 * them as if typed by hand, and "Claude login" removes them all. Which provider
 * is in use is read back from the file, never stored: an edit made elsewhere is
 * seen as it is.
 *
 * Providers are rows of `api_providers`; their keys are not. That table is
 * append-only, so a key written there would outlive its change or deletion. Keys
 * live in api-provider-keys.json, rewritten whole and kept at mode 600, like the
 * account credentials, and never leave the backend: the webview learns only
 * whether a provider has one.
 */

/** The variables a provider owns. Every other variable of the block is left alone. */
export const PROVIDER_ENV_VARS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
] as const;

/** Where a provider's key goes: sent as a bearer token, or as an API key. */
export const PROVIDER_AUTH_VARS = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const;

const NAME_MAX = 80;
const URL_MAX = 2048;
const MODEL_MAX = 200;
const KEY_MAX = 8192;

/** One provider as the webview sees it: everything but the key. */
export interface ApiProviderView {
  id: number;
  name: string;
  baseUrl: string | null;
  authVar: string;
  hasKey: boolean;
  model: string | null;
  opusModel: string | null;
  sonnetModel: string | null;
  haikuModel: string | null;
  fableModel: string | null;
  updatedAt: number;
}

/**
 * What the user settings say about providers: none of their variables set
 * (Claude login), set the way one provider sets them, or set some other way.
 */
export type ApiProviderInUse = { kind: 'login' } | { kind: 'provider'; id: number } | { kind: 'other' };

export interface ApiProvidersResult {
  ok: boolean;
  /** Why the change was refused, when the user can fix it. */
  error?: string;
  providers: ApiProviderView[];
  inUse: ApiProviderInUse;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

function keysPath(): string {
  const home = process.env.CCG_HOME?.trim() || join(homedir(), '.claude-code-gui');
  return join(home, 'api-provider-keys.json');
}

type KeysRead = { status: 'ok'; keys: Record<string, string> } | { status: 'unreadable'; reason: string };

async function readKeys(): Promise<KeysRead> {
  const path = keysPath();
  if (!existsSync(path)) return { status: 'ok', keys: {} };
  try {
    const data = JSON.parse(await readFile(path, 'utf-8')) as { keys?: unknown };
    const keys: Record<string, string> = {};
    if (data.keys && typeof data.keys === 'object' && !Array.isArray(data.keys)) {
      for (const [id, value] of Object.entries(data.keys as Record<string, unknown>)) {
        if (typeof value === 'string') keys[id] = value;
      }
    }
    return { status: 'ok', keys };
  } catch (err) {
    return { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Write the keys whole, at mode 600 (not enforced on Windows, where the user's ACL decides, as for the CLI). */
async function writeKeys(keys: Record<string, string>): Promise<void> {
  const target = keysPath();
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ version: 1, keys }, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    await rename(temp, target);
    await chmod(target, 0o600).catch(() => undefined);
  } finally {
    if (existsSync(temp)) await unlink(temp).catch(() => undefined);
  }
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/** The variables [provider] sets, with null for each one it removes. */
export function providerEnv(provider: ApiProviderFields, key: string | null): Record<string, string | null> {
  const env: Record<string, string | null> = Object.fromEntries(PROVIDER_ENV_VARS.map((name) => [name, null]));
  if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
  if (key) env[provider.authVar] = key;
  if (provider.model) env.ANTHROPIC_MODEL = provider.model;
  if (provider.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = provider.opusModel;
  if (provider.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = provider.sonnetModel;
  if (provider.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.haikuModel;
  if (provider.fableModel) env.ANTHROPIC_DEFAULT_FABLE_MODEL = provider.fableModel;
  return env;
}

/** Which provider the user settings' `env` block matches, compared variable by variable. */
export function providerInUse(
  env: Record<string, unknown>,
  providers: ApiProvider[],
  keys: Record<string, string>,
): ApiProviderInUse {
  const current = (name: string) => (typeof env[name] === 'string' && env[name] !== '' ? (env[name] as string) : null);
  if (PROVIDER_ENV_VARS.every((name) => current(name) === null)) return { kind: 'login' };
  const match = providers.find((p) => {
    const wanted = providerEnv(p, keys[String(p.id)] ?? null);
    return PROVIDER_ENV_VARS.every((name) => wanted[name] === current(name));
  });
  return match ? { kind: 'provider', id: match.id } : { kind: 'other' };
}

function view(p: ApiProvider, keys: Record<string, string>): ApiProviderView {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    authVar: p.authVar,
    hasKey: Boolean(keys[String(p.id)]),
    model: p.model,
    opusModel: p.opusModel,
    sonnetModel: p.sonnetModel,
    haikuModel: p.haikuModel,
    fableModel: p.fableModel,
    updatedAt: p.updatedAt,
  };
}

async function userEnv(): Promise<Record<string, unknown>> {
  const env = (await readClaudeSettings()).env;
  return env && typeof env === 'object' && !Array.isArray(env) ? (env as Record<string, unknown>) : {};
}

/** The providers, the one in use, and [extra] (for a refusal or a failure). */
export async function readApiProviders(extra: { ok?: boolean; error?: string } = {}): Promise<ApiProvidersResult> {
  const providers = await new ApiProviderCollection().byName();
  const read = await readKeys();
  const keys = read.status === 'ok' ? read.keys : {};
  return {
    ok: extra.ok ?? true,
    ...(extra.error ? { error: extra.error } : {}),
    providers: providers.map((p) => view(p, keys)),
    inUse: providerInUse(await userEnv(), providers, keys),
  };
}

// ─── Changing ─────────────────────────────────────────────────────────────────

/** An optional text field: trimmed, empty as null, undefined when it is not text of a sane length. */
function optional(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? undefined : trimmed;
}

/**
 * Add a provider, or change the one with [input.id]. A `key` of undefined keeps
 * the stored key, '' removes it, and anything else replaces it. A provider in use
 * when it is changed is written to the settings again, so the change applies.
 */
export async function saveApiProvider(input: Record<string, unknown>): Promise<ApiProvidersResult> {
  const refuse = (error: string) => readApiProviders({ ok: false, error });
  const name = optional(input.name, NAME_MAX);
  if (!name) return refuse(`A name is required, of at most ${NAME_MAX} characters`);
  const baseUrl = optional(input.baseUrl, URL_MAX);
  if (baseUrl === undefined || (baseUrl !== null && !/^https?:\/\/[^\s]+$/i.test(baseUrl))) {
    return refuse('The address is an http:// or https:// URL');
  }
  const authVar = input.authVar ?? 'ANTHROPIC_AUTH_TOKEN';
  if (typeof authVar !== 'string' || !(PROVIDER_AUTH_VARS as readonly string[]).includes(authVar)) {
    return refuse('The key goes in ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY');
  }
  const models = {
    model: optional(input.model, MODEL_MAX),
    opusModel: optional(input.opusModel, MODEL_MAX),
    sonnetModel: optional(input.sonnetModel, MODEL_MAX),
    haikuModel: optional(input.haikuModel, MODEL_MAX),
    fableModel: optional(input.fableModel, MODEL_MAX),
  };
  if (Object.values(models).some((m) => m === undefined)) return refuse(`A model name is at most ${MODEL_MAX} characters`);
  const key = input.key;
  if (key !== undefined && (typeof key !== 'string' || key.length > KEY_MAX || /\s/.test(key.trim()))) {
    return refuse('A key is one word of text');
  }
  const id = typeof input.id === 'number' && Number.isInteger(input.id) ? input.id : null;
  const fields: ApiProviderFields = { name, baseUrl, authVar, ...(models as Record<keyof typeof models, string | null>) };

  const collection = new ApiProviderCollection();
  const all = await collection.all();
  if (all.some((p) => p.name === name && p.id !== id)) return refuse(`There is already a provider called "${name}"`);
  if (id !== null && !all.some((p) => p.id === id)) return refuse('That provider is no longer there');

  const read = await readKeys();
  if (read.status === 'unreadable') return refuse(`The provider keys file could not be read (${read.reason})`);
  const before = providerInUse(await userEnv(), all, read.keys);
  const wasInUse = id !== null && before.kind === 'provider' && before.id === id;

  let savedId = id;
  try {
    const now = Date.now();
    if (id !== null) {
      await collection.mutate((rows) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return EntityChange.keep(rows, undefined);
        Object.assign(row, fields, { updatedAt: now });
        return EntityChange.write(rows, undefined);
      });
    } else {
      await collection.insertMissing([ApiProvider.draft(fields, now)], (stored, candidate) => stored.name === candidate.name);
      savedId = (await collection.all()).find((p) => p.name === name)?.id ?? null;
    }
    if (savedId !== null && key !== undefined) {
      const keys = { ...read.keys };
      if (typeof key === 'string' && key.trim() !== '') keys[String(savedId)] = key.trim();
      else delete keys[String(savedId)];
      await writeKeys(keys);
    }
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }

  if (wasInUse && savedId !== null) return applyApiProvider(savedId);
  return readApiProviders();
}

/** Delete a provider and its key. The settings are left as they are, in use or not. */
export async function deleteApiProvider(id: unknown): Promise<ApiProvidersResult> {
  if (typeof id !== 'number') return readApiProviders();
  try {
    await new ApiProviderCollection().mutate((rows) => {
      const kept = rows.filter((r) => r.id !== id);
      return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
    });
    const read = await readKeys();
    if (read.status === 'ok' && String(id) in read.keys) {
      const keys = { ...read.keys };
      delete keys[String(id)];
      await writeKeys(keys);
    }
  } catch (err) {
    return readApiProviders({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  return readApiProviders();
}

/**
 * Use the provider [id], or Claude login for null: write its variables into the
 * user settings' `env` block and remove the provider variables it does not set.
 */
export async function applyApiProvider(id: unknown): Promise<ApiProvidersResult> {
  let changes: Record<string, string | null>;
  if (id === null) {
    changes = Object.fromEntries(PROVIDER_ENV_VARS.map((name) => [name, null]));
  } else {
    const provider = (await new ApiProviderCollection().all()).find((p) => p.id === id);
    if (!provider) return readApiProviders({ ok: false, error: 'That provider is no longer there' });
    const read = await readKeys();
    if (read.status === 'unreadable') {
      return readApiProviders({ ok: false, error: `The provider keys file could not be read (${read.reason})` });
    }
    changes = providerEnv(provider, read.keys[String(provider.id)] ?? null);
  }
  const result = await saveClaudeEnvVars(changes, 'global');
  if (result.status === 'error') return readApiProviders({ ok: false, error: result.error });
  return readApiProviders();
}
