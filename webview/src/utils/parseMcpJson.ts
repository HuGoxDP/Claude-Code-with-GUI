/**
 * Smart parser for the "Add MCP Server" paste box.
 *
 * Accepts the two JSON shapes users actually copy from the wild and normalises
 * them into a list of { name, config } pairs ready for `claude mcp add-json`:
 *
 *   1. Wrapper form (`.mcp.json` / Claude Desktop config) — name lives in the key:
 *        { "mcpServers": { "my-server": { "command": "npx", "args": [...] } } }
 *      May hold several servers; each becomes its own entry. nameFallback is ignored.
 *
 *   2. Inner config form — a single server config with no wrapper:
 *        { "command": "npx", "args": [...] }   or   { "type": "http", "url": "..." }
 *      The name comes from nameFallback (the form's Name field), which is required here.
 *
 *   3. GitHub Copilot / VS Code form (`mcp.json` of those tools) — `servers`, not
 *      `mcpServers`:
 *        { "servers": { "my-server": { "type": "stdio", "command": "npx", ... } } }
 *      Converted, not passed through: see {@link fromCopilotConfig}.
 *
 * Per the project's원본 보존 원칙, a Claude config (forms 1 and 2) is passed
 * through VERBATIM — no key renaming, no `type` injection. Validation only checks
 * that each config carries a `command` (stdio) or a `url` (remote); the CLI is
 * the final arbiter.
 */

export interface ParsedMcpServer {
  name: string;
  config: Record<string, unknown>;
}

export type ParseMcpJsonResult =
  | { ok: true; servers: ParsedMcpServer[] }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A config is installable only if it has a stdio `command` or a remote `url`. */
function hasInstallTarget(config: Record<string, unknown>): boolean {
  const hasCommand = typeof config.command === 'string' && config.command.trim().length > 0;
  const hasUrl = typeof config.url === 'string' && config.url.trim().length > 0;
  return hasCommand || hasUrl;
}

export function parseMcpJson(rawText: string, nameFallback: string): ParseMcpJsonResult {
  const text = rawText.trim();
  if (!text) {
    return { ok: false, error: 'Paste a JSON config to add a server.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON: ${detail}` };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Expected a JSON object (an mcpServers wrapper or a single server config).' };
  }

  // Form 3: GitHub Copilot / VS Code `servers` wrapper.
  if (isPlainObject(parsed.servers) && parsed.mcpServers === undefined) {
    return parseCopilotServers(parsed.servers);
  }

  // Form 1: mcpServers wrapper.
  if (isPlainObject(parsed.mcpServers)) {
    const entries = Object.entries(parsed.mcpServers);
    if (entries.length === 0) {
      return { ok: false, error: 'The "mcpServers" object is empty — no servers to add.' };
    }
    const servers: ParsedMcpServer[] = [];
    for (const [name, config] of entries) {
      if (!isPlainObject(config)) {
        return { ok: false, error: `Server "${name}" is not a JSON object.` };
      }
      if (!hasInstallTarget(config)) {
        return { ok: false, error: `Server "${name}" needs a "command" (stdio) or "url" (remote).` };
      }
      servers.push({ name, config });
    }
    return { ok: true, servers };
  }

  // Form 2: bare inner config — name comes from the Name field.
  const name = nameFallback.trim();
  if (!name) {
    return { ok: false, error: 'Name is required when pasting a single server config (no "mcpServers" wrapper).' };
  }
  if (!hasInstallTarget(parsed)) {
    return { ok: false, error: 'Config needs a "command" (stdio) or "url" (remote).' };
  }
  return { ok: true, servers: [{ name, config: parsed }] };
}

/** The keys of a Copilot server entry that mean the same thing to Claude Code. */
const COPILOT_SHARED_KEYS = ['type', 'command', 'args', 'env', 'url', 'headers'] as const;

/** `${input:…}`, `${workspaceFolder}` and the like: VS Code variables Claude Code has no value for. */
const VSCODE_ONLY_VARIABLE = /\$\{(?:input:[^}]*|workspaceFolder[^}]*|workspaceRoot|userHome|cwd|pathSeparator|config:[^}]*|command:[^}]*)\}/g;

function parseCopilotServers(servers: Record<string, unknown>): ParseMcpJsonResult {
  const entries = Object.entries(servers);
  if (entries.length === 0) {
    return { ok: false, error: 'The "servers" object is empty — no servers to add.' };
  }
  const converted: ParsedMcpServer[] = [];
  for (const [name, entry] of entries) {
    if (!isPlainObject(entry)) {
      return { ok: false, error: `Server "${name}" is not a JSON object.` };
    }
    const result = fromCopilotConfig(name, entry);
    if (!result.ok) return result;
    converted.push({ name, config: result.config });
  }
  return { ok: true, servers: converted };
}

/**
 * One Copilot / VS Code server entry as the config `claude mcp add-json` takes.
 *
 * Measured against the CLI (2.1.291), passing the entry as it is breaks it
 * silently: keys Claude Code does not know are dropped without a word, so a
 * `requestInit.headers` (where Copilot keeps auth headers) and an `envFile`
 * vanish, and a remote server without `type` is refused. So:
 *
 * - The keys both tools share are kept as they are; the rest is left out.
 * - `requestInit.headers` joins `headers` (a direct header wins).
 * - A missing `type` is inferred: `command` means stdio, a URL ending in a
 *   `/sse` path means sse, any other URL http.
 * - `${env:NAME}` becomes `${NAME}`, which is how Claude Code reads the same
 *   environment variable.
 * - What has no equivalent is refused with the reason instead of being added
 *   broken: an `envFile`, and VS Code variables such as `${input:…}` (a value
 *   VS Code asks for) or `${workspaceFolder}`.
 */
export function fromCopilotConfig(
  name: string,
  entry: Record<string, unknown>,
): { ok: true; config: Record<string, unknown> } | { ok: false; error: string } {
  if (entry.envFile !== undefined) {
    return {
      ok: false,
      error: `Server "${name}" reads its environment from "envFile", which Claude Code does not support. Put the variables under "env" instead.`,
    };
  }

  const config: Record<string, unknown> = {};
  for (const key of COPILOT_SHARED_KEYS) {
    if (entry[key] !== undefined && entry[key] !== null) config[key] = entry[key];
  }

  const requestInit = isPlainObject(entry.requestInit) ? entry.requestInit : undefined;
  const initHeaders = requestInit && isPlainObject(requestInit.headers) ? requestInit.headers : undefined;
  if (initHeaders) {
    config.headers = { ...initHeaders, ...(isPlainObject(config.headers) ? config.headers : {}) };
  }

  if (!hasInstallTarget(config)) {
    return { ok: false, error: `Server "${name}" needs a "command" (stdio) or "url" (remote).` };
  }
  if (config.type === undefined) {
    config.type = typeof config.command === 'string' && config.command.trim() !== ''
      ? 'stdio'
      : /\/sse(?:[/?#]|$)/.test(String(config.url)) ? 'sse' : 'http';
  }

  const text = JSON.stringify(config).replace(/\$\{env:([^}]+)\}/g, '${$1}');
  const unsupported = [...new Set(text.match(VSCODE_ONLY_VARIABLE) ?? [])];
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `Server "${name}" uses ${unsupported.join(', ')}, which only VS Code fills in. Replace it with the value, or with \${NAME} to read an environment variable.`,
    };
  }
  return { ok: true, config: JSON.parse(text) as Record<string, unknown> };
}
