import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractSessionInfo } from '../extractSessionInfo';

describe('extractSessionInfo', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'extract-session-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeJsonl(lines: string[]): Promise<string> {
    const filePath = join(tmpDir, `session-${Math.random().toString(36).slice(2)}.jsonl`);
    await writeFile(filePath, lines.join('\n'));
    return filePath;
  }

  describe('extractSessionInfo()', () => {
    it('should extract title from summary entry', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Hello world' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Hi there' }] },
        }),
        JSON.stringify({
          type: 'summary',
          leafUuid: 'u2',
          summary: 'Greeting conversation',
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Greeting conversation');
      // The first prompt settles the title on line 1, so the scan stops there
      // and never counts the rest. The summary is still found, from the tail.
      expect(result.messageCount).toBeNull();
      expect(result.isSidechain).toBe(false);
      expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
    });

    it('reports where the session was started, as the CLI recorded it', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2025-01-01T00:00:00Z' }),
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          entrypoint: 'cli',
          timestamp: '2025-01-01T00:00:01Z',
          message: { content: [{ type: 'text', text: 'Hello world' }] },
        }),
      ]);

      expect((await extractSessionInfo(filePath)).entrypoint).toBe('cli');
    });

    it('reports no entrypoint for a file that carries none', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Hello world' }] },
        }),
      ]);

      expect((await extractSessionInfo(filePath)).entrypoint).toBeNull();
    });

    it('should use first user prompt as title when no summary exists', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Build me a React app' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Sure!' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Build me a React app');
    });

    it('should return "No title" when no summary or user prompt exists', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'assistant',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Hello' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('No title');
    });

    it('should detect sidechain session from first message', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          isSidechain: true,
          message: { content: 'test' },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.isSidechain).toBe(true);
      expect(result.title).toBe('Sidechain Session');
    });

    it('should return "Empty Session" when no user or assistant messages exist', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'system',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: 'init' },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Empty Session');
      expect(result.isSidechain).toBe(true);
    });

    it('should extract lastTimestamp from the latest message', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Hi' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T12:00:00Z',
          message: { content: [{ type: 'text', text: 'Hello' }] },
        }),
        JSON.stringify({
          uuid: 'u3',
          parentUuid: 'u2',
          type: 'user',
          timestamp: '2025-01-02T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Bye' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.lastTimestamp).toBe('2025-01-02T00:00:00Z');
      expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
    });

    it('should skip malformed JSON lines gracefully', async () => {
      const filePath = await writeJsonl([
        'not valid json',
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Hello' }] },
        }),
        '{"broken',
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Hi' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Hello');
      // Stopped at the prompt, so nothing was counted past it.
      expect(result.messageCount).toBeNull();
    });

    it('should handle string content in messages', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: 'Plain string content' },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Response' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Plain string content');
    });

    it('should remove system tags from user prompt title', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: {
            content: [
              {
                type: 'text',
                text: '<system-tag>hidden</system-tag>Build a web app',
              },
            ],
          },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Sure' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Build a web app');
    });

    it('should skip isMeta user messages for title extraction', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          isMeta: true,
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Meta message' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'user',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Real user message' }] },
        }),
        JSON.stringify({
          uuid: 'u3',
          parentUuid: 'u2',
          type: 'assistant',
          timestamp: '2025-01-01T00:02:00Z',
          message: { content: [{ type: 'text', text: 'Response' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Real user message');
    });

    it('uses the slash command name as the title for slash-command sessions', async () => {
      // Reproduces the /init shape: the first user entry is the command tags.
      // The title should mirror what the chat renders as a command chip: "/init".
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: '<command-message>init</command-message>\n<command-name>/init</command-name>' },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'user',
          isMeta: true,
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Please analyze this codebase and create a CLAUDE.md file' }] },
        }),
        JSON.stringify({
          uuid: 'u3',
          parentUuid: 'u2',
          type: 'assistant',
          timestamp: '2025-01-01T00:02:00Z',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('/init');
    });

    it('normalizes the slash prefix when extracting the command name', async () => {
      // command-name may arrive with or without a leading slash; title is always "/name".
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: '<command-name>compact</command-name>' },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'ok' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('/compact');
    });

    it('never leaks raw command tags as the title', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: '<command-message>compact</command-message>\n<command-name>/compact</command-name>' },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'ok' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).not.toContain('<');
    });

    it('skips a non-command tag-only prompt and uses the next meaningful prompt', async () => {
      // First user entry is only a system tag (no command-name); fall through.
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: '<system-reminder>be careful</system-reminder>' },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'user',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'What does this function do?' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('What does this function do?');
    });

    it('returns "No title" when only non-command tags and no real text exist', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: '<system-reminder>nothing meaningful</system-reminder>' },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'ok' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('No title');
    });

    it('should handle empty lines', async () => {
      const filePath = await writeJsonl([
        '',
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Hi' }] },
        }),
        '',
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Hello' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Hi');
      expect(result.messageCount).toBeNull();
    });

    it('should use last text block from content array for title', async () => {
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: {
            content: [
              { type: 'image', data: 'base64data' },
              { type: 'text', text: 'First text' },
              { type: 'text', text: 'Second text' },
            ],
          },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Response' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Second text');
    });

    // Regression test for issue #19: large JSONL must not stall or exhaust memory.
    it('should handle multi-megabyte JSONL without loading the whole file', async () => {
      const lines: string[] = [];
      lines.push(
        JSON.stringify({
          uuid: 'u0',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Start' }] },
        }),
      );

      // ~10 MB worth of assistant chatter (10,000 lines × ~1KB).
      const bulk = 'A'.repeat(1000);
      for (let i = 1; i <= 10_000; i++) {
        lines.push(
          JSON.stringify({
            uuid: `u${i}`,
            parentUuid: `u${i - 1}`,
            type: i % 2 === 0 ? 'user' : 'assistant',
            timestamp: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
            message: { content: [{ type: 'text', text: bulk }] },
          }),
        );
      }
      lines.push(
        JSON.stringify({
          uuid: 'uLast',
          parentUuid: 'u10000',
          type: 'assistant',
          timestamp: '2025-12-31T23:59:59Z',
          message: { content: [{ type: 'text', text: 'End' }] },
        }),
      );

      const filePath = await writeJsonl(lines);
      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Start');
      // Counting would mean parsing all ~10MB, which is exactly what the early
      // stop exists to avoid, so a session this size reports no count at all
      // rather than a number that would be wrong.
      expect(result.messageCount).toBeNull();
      expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
      // Comes from the tail window, not the forward scan: the scan stopped on
      // line 1 and never saw this entry.
      expect(result.lastTimestamp).toBe('2025-12-31T23:59:59Z');
      expect(result.isSidechain).toBe(false);
    }, 15_000);

    // Regression test for issue #19: sidechain detection should short-circuit.
    it('should stop reading at first sidechain entry without scanning the rest', async () => {
      const lines: string[] = [
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          isSidechain: true,
          message: { content: [{ type: 'text', text: 'sidechain start' }] },
        }),
      ];
      // Append lots of garbage that, if parsed, would explode.
      for (let i = 0; i < 5000; i++) {
        lines.push('{"broken json that should never be read');
      }

      const filePath = await writeJsonl(lines);
      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Sidechain Session');
      expect(result.isSidechain).toBe(true);
    });

    it('counts every entry when the file is read to the end', async () => {
      // No real user prompt means nothing settles the title early, so the scan
      // runs to the end and the count it produces covers the whole file.
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'assistant',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'One' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-01-01T00:01:00Z',
          message: { content: [{ type: 'text', text: 'Two' }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('No title');
      expect(result.messageCount).toBe(2);
      expect(result.lastTimestamp).toBe('2025-01-01T00:01:00Z');
    });

    it('takes a summary parked at the end of a large file as the title', async () => {
      // The forward scan stops on line 1, far from the summary. Losing the
      // summary would silently downgrade the title to the raw first prompt.
      const bulk = 'B'.repeat(2000);
      const lines: string[] = [
        JSON.stringify({
          uuid: 'u0',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Raw first prompt' }] },
        }),
      ];
      for (let i = 1; i <= 200; i++) {
        lines.push(
          JSON.stringify({
            uuid: `u${i}`,
            parentUuid: `u${i - 1}`,
            type: 'assistant',
            timestamp: '2025-02-01T00:00:00Z',
            message: { content: [{ type: 'text', text: bulk }] },
          }),
        );
      }
      lines.push(JSON.stringify({ type: 'summary', leafUuid: 'u200', summary: 'Summarised topic' }));

      const filePath = await writeJsonl(lines);
      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Summarised topic');
    });

    it('widens the tail window when the final entries exceed the smallest one', async () => {
      // Both trailing entries are larger than the first window, so that window
      // holds no complete entry at all. Without widening, lastTimestamp would
      // fall back to the top of the file and the session would sort as old.
      const huge = 'C'.repeat(200_000);
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Start' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-06-01T00:00:00Z',
          message: { content: [{ type: 'text', text: huge }] },
        }),
        JSON.stringify({
          uuid: 'u3',
          parentUuid: 'u2',
          type: 'assistant',
          timestamp: '2025-12-31T23:59:59Z',
          message: { content: [{ type: 'text', text: huge }] },
        }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.title).toBe('Start');
      expect(result.lastTimestamp).toBe('2025-12-31T23:59:59Z');
    });

    it('ignores a non-counted trailing entry when deciding lastTimestamp', async () => {
      // The forward scan only lets a counted entry move the clock; the tail
      // window has to apply the same rule or the two disagree.
      const filePath = await writeJsonl([
        JSON.stringify({
          uuid: 'u1',
          parentUuid: null,
          type: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Start' }] },
        }),
        JSON.stringify({
          uuid: 'u2',
          parentUuid: 'u1',
          type: 'assistant',
          timestamp: '2025-06-01T00:00:00Z',
          message: { content: [{ type: 'text', text: 'Reply' }] },
        }),
        JSON.stringify({ type: 'file-history-snapshot', timestamp: '2025-12-31T23:59:59Z' }),
      ]);

      const result = await extractSessionInfo(filePath);

      expect(result.lastTimestamp).toBe('2025-06-01T00:00:00Z');
    });
  });

  describe('custom-title (CLI /rename)', () => {
    const user = JSON.stringify({
      uuid: 'u1',
      parentUuid: null,
      type: 'user',
      timestamp: '2025-01-01T00:00:00Z',
      message: { content: [{ type: 'text', text: 'First prompt' }] },
    });
    const assistant = JSON.stringify({
      uuid: 'u2',
      parentUuid: 'u1',
      type: 'assistant',
      timestamp: '2025-01-01T00:01:00Z',
      message: { content: [{ type: 'text', text: 'Reply' }] },
    });
    const customTitle = (value: string | number) =>
      JSON.stringify({ type: 'custom-title', customTitle: value, sessionId: 's1' });

    it('uses a single custom-title in the head as the title', async () => {
      const filePath = await writeJsonl([customTitle('Renamed'), user, assistant]);

      expect((await extractSessionInfo(filePath)).title).toBe('Renamed');
    });

    it('uses the last custom-title when the head holds several', async () => {
      const filePath = await writeJsonl([customTitle('First'), customTitle('Second'), user, assistant]);

      expect((await extractSessionInfo(filePath)).title).toBe('Second');
    });

    it('prefers a custom-title in the tail window over the one in the head', async () => {
      // The forward scan stops at the first prompt, so only the tail sees the later rename.
      const filePath = await writeJsonl([customTitle('Old name'), user, assistant, customTitle('Newest name')]);

      expect((await extractSessionInfo(filePath)).title).toBe('Newest name');
    });

    it('prefers the newest custom-title when the tail holds several', async () => {
      const filePath = await writeJsonl([user, assistant, customTitle('Older'), customTitle('Newer')]);

      expect((await extractSessionInfo(filePath)).title).toBe('Newer');
    });

    it('ranks custom-title above summary', async () => {
      const summary = JSON.stringify({ type: 'summary', leafUuid: 'u2', summary: 'Auto summary' });
      const filePath = await writeJsonl([summary, customTitle('Renamed'), user, assistant]);

      expect((await extractSessionInfo(filePath)).title).toBe('Renamed');
    });

    it('ignores empty and non-string custom-title values', async () => {
      const filePath = await writeJsonl([customTitle('Kept'), customTitle(''), customTitle(42), user, assistant]);

      expect((await extractSessionInfo(filePath)).title).toBe('Kept');
    });

    it('keeps the existing behaviour when there is no custom-title', async () => {
      const summary = JSON.stringify({ type: 'summary', leafUuid: 'u2', summary: 'Auto summary' });

      expect((await extractSessionInfo(await writeJsonl([user, assistant, summary]))).title).toBe('Auto summary');
      expect((await extractSessionInfo(await writeJsonl([user, assistant]))).title).toBe('First prompt');
    });
  });

  describe('ai-title and agent-name (the CLI\'s own names)', () => {
    const user = JSON.stringify({
      uuid: 'u1',
      parentUuid: null,
      type: 'user',
      timestamp: '2025-01-01T00:00:00Z',
      message: { content: [{ type: 'text', text: 'First prompt' }] },
    });
    const assistant = JSON.stringify({
      uuid: 'u2',
      parentUuid: 'u1',
      type: 'assistant',
      timestamp: '2025-01-01T00:01:00Z',
      message: { content: [{ type: 'text', text: 'Reply' }] },
    });
    const aiTitle = (value: string | number) => JSON.stringify({ type: 'ai-title', aiTitle: value, sessionId: 's1' });
    const agentName = (value: string) => JSON.stringify({ type: 'agent-name', agentName: value, sessionId: 's1' });
    const customTitle = (value: string) => JSON.stringify({ type: 'custom-title', customTitle: value, sessionId: 's1' });
    const summary = JSON.stringify({ type: 'summary', leafUuid: 'u2', summary: 'Auto summary' });

    it('uses the CLI\'s generated title over a summary and the first prompt', async () => {
      const result = await extractSessionInfo(await writeJsonl([summary, user, assistant, aiTitle('Fix the login form')]));
      expect(result).toMatchObject({ title: 'Fix the login form', titleSource: 'ai-title' });
    });

    it('keeps the newest generated title', async () => {
      const filePath = await writeJsonl([aiTitle('Old'), user, assistant, aiTitle('Older'), aiTitle('Newest')]);
      expect((await extractSessionInfo(filePath)).title).toBe('Newest');
    });

    it('ranks a /rename above the generated title, and a --name above both, like claude --resume', async () => {
      expect((await extractSessionInfo(await writeJsonl([user, assistant, aiTitle('Generated'), customTitle('Renamed')]))))
        .toMatchObject({ title: 'Renamed', titleSource: 'custom-title' });
      expect((await extractSessionInfo(await writeJsonl([agentName('release-bot'), user, assistant, customTitle('Renamed')]))))
        .toMatchObject({ title: 'release-bot', titleSource: 'agent-name' });
    });

    it('ignores empty and non-string generated titles', async () => {
      const filePath = await writeJsonl([user, assistant, aiTitle(''), aiTitle(7)]);
      expect(await extractSessionInfo(filePath)).toMatchObject({ title: 'First prompt', titleSource: 'prompt' });
    });

    it('says where every other title came from', async () => {
      expect((await extractSessionInfo(await writeJsonl([user, assistant, summary]))).titleSource).toBe('summary');
      expect((await extractSessionInfo(await writeJsonl([user, assistant]))).titleSource).toBe('prompt');
    });
  });
});
