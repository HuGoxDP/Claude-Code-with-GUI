import { describe, it, expect } from 'vitest';
import { parseMcpJson } from '../parseMcpJson';

describe('parseMcpJson', () => {
  describe('invalid input', () => {
    it('rejects empty input', () => {
      const r = parseMcpJson('', 'fallback');
      expect(r.ok).toBe(false);
    });

    it('rejects whitespace-only input', () => {
      const r = parseMcpJson('   \n  ', 'fallback');
      expect(r.ok).toBe(false);
    });

    it('rejects malformed JSON', () => {
      const r = parseMcpJson('{ not json', 'fallback');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.toLowerCase()).toContain('json');
    });

    it('rejects a JSON array at the top level', () => {
      const r = parseMcpJson('[1, 2, 3]', 'fallback');
      expect(r.ok).toBe(false);
    });

    it('rejects a JSON primitive at the top level', () => {
      const r = parseMcpJson('"hello"', 'fallback');
      expect(r.ok).toBe(false);
    });
  });

  describe('mcpServers wrapper form', () => {
    it('extracts a single stdio server from the wrapper, ignoring nameFallback', () => {
      const input = JSON.stringify({
        mcpServers: {
          'my-server': { command: 'npx', args: ['-y', 'my-mcp-server'] },
        },
      });
      const r = parseMcpJson(input, 'IGNORED');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.servers).toHaveLength(1);
        expect(r.servers[0].name).toBe('my-server');
        expect(r.servers[0].config).toEqual({ command: 'npx', args: ['-y', 'my-mcp-server'] });
      }
    });

    it('extracts multiple servers from the wrapper', () => {
      const input = JSON.stringify({
        mcpServers: {
          a: { command: 'cmd-a' },
          b: { type: 'http', url: 'https://example.com/mcp' },
        },
      });
      const r = parseMcpJson(input, '');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.servers).toHaveLength(2);
        expect(r.servers.map((s) => s.name).sort()).toEqual(['a', 'b']);
      }
    });

    it('preserves the original config verbatim (no key renaming or type injection)', () => {
      const config = { command: 'npx', args: ['x'], env: { K: 'v' } };
      const input = JSON.stringify({ mcpServers: { s: config } });
      const r = parseMcpJson(input, '');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.servers[0].config).toEqual(config);
    });

    it('rejects an empty mcpServers object', () => {
      const r = parseMcpJson(JSON.stringify({ mcpServers: {} }), 'fallback');
      expect(r.ok).toBe(false);
    });

    it('rejects a wrapper entry whose value is not an object', () => {
      const r = parseMcpJson(JSON.stringify({ mcpServers: { s: 'oops' } }), '');
      expect(r.ok).toBe(false);
    });

    it('rejects a wrapper entry with neither command nor url', () => {
      const r = parseMcpJson(JSON.stringify({ mcpServers: { s: { args: ['x'] } } }), '');
      expect(r.ok).toBe(false);
    });
  });

  describe('inner config form (no wrapper)', () => {
    it('uses nameFallback for a bare stdio config', () => {
      const input = JSON.stringify({ command: 'npx', args: ['-y', 'pkg'] });
      const r = parseMcpJson(input, 'my-name');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.servers).toHaveLength(1);
        expect(r.servers[0].name).toBe('my-name');
        expect(r.servers[0].config).toEqual({ command: 'npx', args: ['-y', 'pkg'] });
      }
    });

    it('accepts a bare remote (url) config', () => {
      const input = JSON.stringify({ type: 'http', url: 'https://example.com/mcp' });
      const r = parseMcpJson(input, 'remote');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.servers[0].config).toEqual({ type: 'http', url: 'https://example.com/mcp' });
    });

    it('rejects a bare config when nameFallback is empty', () => {
      const r = parseMcpJson(JSON.stringify({ command: 'npx' }), '');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.toLowerCase()).toContain('name');
    });

    it('rejects a bare config when nameFallback is whitespace', () => {
      const r = parseMcpJson(JSON.stringify({ command: 'npx' }), '   ');
      expect(r.ok).toBe(false);
    });

    it('trims the fallback name', () => {
      const r = parseMcpJson(JSON.stringify({ command: 'npx' }), '  spaced  ');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.servers[0].name).toBe('spaced');
    });

    it('rejects a bare config with neither command nor url', () => {
      const r = parseMcpJson(JSON.stringify({ foo: 'bar' }), 'name');
      expect(r.ok).toBe(false);
    });
  });
});

describe('parseMcpJson — GitHub Copilot / VS Code "servers" form', () => {
  const parse = (value: unknown) => parseMcpJson(JSON.stringify(value), '');

  it('adds every server, keeping the keys both tools share', () => {
    const r = parse({
      servers: {
        github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer abc' } },
        fs: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], env: { DEBUG: '1' } },
      },
      inputs: [],
    });
    expect(r).toEqual({
      ok: true,
      servers: [
        { name: 'github', config: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer abc' } } },
        { name: 'fs', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], env: { DEBUG: '1' } } },
      ],
    });
  });

  it('moves requestInit.headers into headers, where Claude Code reads them', () => {
    const r = parse({ servers: { api: { type: 'http', url: 'https://x.test/mcp', requestInit: { headers: { A: '1', B: '2' } }, headers: { B: 'direct' } } } });
    expect(r.ok && r.servers[0].config).toEqual({ type: 'http', url: 'https://x.test/mcp', headers: { A: '1', B: 'direct' } });
  });

  it('infers the type Claude Code needs for a remote server', () => {
    const r = parse({ servers: { a: { url: 'https://x.test/sse' }, b: { url: 'https://x.test/mcp' }, c: { command: 'run' } } });
    expect(r.ok && r.servers.map((s) => s.config.type)).toEqual(['sse', 'http', 'stdio']);
  });

  it('turns ${env:NAME} into ${NAME} and drops keys only VS Code knows', () => {
    const r = parse({ servers: { a: { type: 'stdio', command: 'run', env: { TOKEN: '${env:GH_TOKEN}' }, dev: { watch: 'x' }, gallery: true } } });
    expect(r.ok && r.servers[0].config).toEqual({ type: 'stdio', command: 'run', env: { TOKEN: '${GH_TOKEN}' } });
  });

  it('refuses a VS Code input variable instead of adding a server that cannot work', () => {
    const r = parse({ servers: { gh: { type: 'http', url: 'https://x.test/mcp', headers: { Authorization: 'Bearer ${input:github_token}' } } } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('${input:github_token}');
  });

  it('refuses envFile, which Claude Code would drop without a word', () => {
    const r = parse({ servers: { a: { type: 'stdio', command: 'run', envFile: '${workspaceFolder}/.env' } } });
    expect(!r.ok && r.error).toContain('envFile');
  });

  it('leaves the Claude wrapper alone when both keys are present', () => {
    const r = parse({ mcpServers: { a: { command: 'run', custom: 1 } }, servers: { b: { command: 'x' } } });
    expect(r).toEqual({ ok: true, servers: [{ name: 'a', config: { command: 'run', custom: 1 } }] });
  });
});
