import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { applyApiProvider, deleteApiProvider, readApiProviders, saveApiProvider } from '../api-providers';

// Real files: the entity table, the private keys file, and Claude's user settings.
describe('api-providers', () => {
  const original = { ccg: process.env.CCG_HOME, config: process.env.CLAUDE_CONFIG_DIR };
  let root: string;
  let settingsFile: string;
  let keysFile: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-api-providers-')));
    process.env.CCG_HOME = join(root, 'ccg');
    process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
    mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
    settingsFile = join(process.env.CLAUDE_CONFIG_DIR, 'settings.json');
    keysFile = join(process.env.CCG_HOME, 'api-provider-keys.json');
    writeFileSync(settingsFile, JSON.stringify({ model: 'opus', env: { HTTPS_PROXY: 'http://proxy:3128' } }));
  });

  afterEach(() => {
    for (const [name, value] of [['CCG_HOME', original.ccg], ['CLAUDE_CONFIG_DIR', original.config]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });

  const settings = () => JSON.parse(readFileSync(settingsFile, 'utf-8'));
  const gateway = {
    name: 'Gateway',
    baseUrl: 'https://gateway.example/anthropic',
    authVar: 'ANTHROPIC_AUTH_TOKEN',
    key: 'gw-secret-123',
    model: 'gw-large',
    sonnetModel: 'gw-medium',
    haikuModel: 'gw-small',
  };

  it('starts on Claude login with no providers', async () => {
    expect(await readApiProviders()).toEqual({ ok: true, providers: [], inUse: { kind: 'login' } });
  });

  it('saves a provider without its key, which goes to a private file instead', async () => {
    const { ok, providers } = await saveApiProvider(gateway);
    expect(ok).toBe(true);
    expect(providers).toEqual([
      expect.objectContaining({ name: 'Gateway', baseUrl: 'https://gateway.example/anthropic', hasKey: true, model: 'gw-large', opusModel: null }),
    ]);
    expect(JSON.stringify(providers)).not.toContain('gw-secret-123');

    const entityFiles = readdirSync(join(process.env.CCG_HOME as string, 'entities', 'provider'));
    for (const file of entityFiles) {
      expect(readFileSync(join(process.env.CCG_HOME as string, 'entities', 'provider', file), 'utf-8')).not.toContain('gw-secret-123');
    }
    expect(JSON.parse(readFileSync(keysFile, 'utf-8')).keys).toEqual({ [String(providers[0].id)]: 'gw-secret-123' });
    if (process.platform !== 'win32') expect(statSync(keysFile).mode & 0o777).toBe(0o600);
  });

  it('uses a provider by writing its variables, keeping every other setting and variable', async () => {
    const { providers } = await saveApiProvider(gateway);
    const result = await applyApiProvider(providers[0].id);

    expect(result.inUse).toEqual({ kind: 'provider', id: providers[0].id });
    expect(settings()).toEqual({
      model: 'opus',
      env: {
        HTTPS_PROXY: 'http://proxy:3128',
        ANTHROPIC_BASE_URL: 'https://gateway.example/anthropic',
        ANTHROPIC_AUTH_TOKEN: 'gw-secret-123',
        ANTHROPIC_MODEL: 'gw-large',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gw-medium',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gw-small',
      },
    });
  });

  it('switches providers cleanly, and Claude login removes them all', async () => {
    const first = (await saveApiProvider(gateway)).providers[0];
    await applyApiProvider(first.id);
    const second = (await saveApiProvider({ name: 'Direct key', authVar: 'ANTHROPIC_API_KEY', key: 'sk-other' })).providers.find(
      (p) => p.name === 'Direct key',
    )!;

    await applyApiProvider(second.id);
    expect(settings().env).toEqual({ HTTPS_PROXY: 'http://proxy:3128', ANTHROPIC_API_KEY: 'sk-other' });

    const login = await applyApiProvider(null);
    expect(login.inUse).toEqual({ kind: 'login' });
    expect(settings()).toEqual({ model: 'opus', env: { HTTPS_PROXY: 'http://proxy:3128' } });
  });

  it('says "other" when the variables were set some other way', async () => {
    await saveApiProvider(gateway);
    writeFileSync(settingsFile, JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://elsewhere.example' } }));
    expect((await readApiProviders()).inUse).toEqual({ kind: 'other' });
  });

  it('rewrites the settings when the provider in use is changed, and keeps the key unless given', async () => {
    const { id } = (await saveApiProvider(gateway)).providers[0];
    await applyApiProvider(id);

    const result = await saveApiProvider({ ...gateway, id, key: undefined, model: 'gw-xl' });

    expect(result.inUse).toEqual({ kind: 'provider', id });
    expect(settings().env.ANTHROPIC_MODEL).toBe('gw-xl');
    expect(settings().env.ANTHROPIC_AUTH_TOKEN).toBe('gw-secret-123');
  });

  it('refuses a duplicate name, a bad address and an unknown key variable', async () => {
    await saveApiProvider(gateway);
    expect((await saveApiProvider(gateway)).error).toBe('There is already a provider called "Gateway"');
    expect((await saveApiProvider({ name: 'X', baseUrl: 'gateway.example' })).error).toBe('The address is an http:// or https:// URL');
    expect((await saveApiProvider({ name: 'Y', authVar: 'OPENAI_API_KEY' })).error).toBe(
      'The key goes in ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY',
    );
    expect((await readApiProviders()).providers).toHaveLength(1);
  });

  it('deletes a provider and its key, leaving the settings as they are', async () => {
    const { id } = (await saveApiProvider(gateway)).providers[0];
    await applyApiProvider(id);

    const result = await deleteApiProvider(id);

    expect(result.providers).toEqual([]);
    expect(result.inUse).toEqual({ kind: 'other' });
    expect(JSON.parse(readFileSync(keysFile, 'utf-8')).keys).toEqual({});
    expect(settings().env.ANTHROPIC_AUTH_TOKEN).toBe('gw-secret-123');
  });

  it('refuses to use a provider while its key file cannot be read', async () => {
    const { id } = (await saveApiProvider(gateway)).providers[0];
    writeFileSync(keysFile, '{ broken');
    const result = await applyApiProvider(id);
    expect(result.ok).toBe(false);
    expect(existsSync(settingsFile) && settings().env.ANTHROPIC_BASE_URL).toBeFalsy();
  });
});
