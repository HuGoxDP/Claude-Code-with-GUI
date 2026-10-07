/**
 * Helpers for the editor of Claude's settings.json `env` block.
 */

/** A name a process can carry as an environment variable. */
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Names whose value is a credential, shown masked until asked for. The same
 * endings the backend treats as API keys (claude-settings.ts), plus the usual
 * words for a secret.
 */
const SECRET_NAME = /(API_KEY|API_TOKEN|AUTH_TOKEN|_TOKEN|SECRET|PASSWORD|PASSWD)$/i;

export function isSecretEnvName(name: string): boolean {
  return SECRET_NAME.test(name);
}

/**
 * The block's variables as name/value pairs, sorted by name. The CLI reads a
 * number or a boolean as its text, so that is what the editor shows; anything
 * that is not a plain value is left out rather than shown as "[object Object]".
 */
export function envEntries(env: unknown): Array<[string, string]> {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return [];
  return Object.entries(env as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    .map(([name, value]) => [name, String(value)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
}
