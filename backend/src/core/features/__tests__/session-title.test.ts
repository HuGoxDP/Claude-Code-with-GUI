import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../claude-print', () => ({ runClaudePrint: vi.fn() }));
vi.mock('../getProjectSessionsPath', () => ({ getProjectSessionsPath: vi.fn() }));
vi.mock('../settings', () => ({ readMergedSettings: vi.fn() }));

import { runClaudePrint } from '../claude-print';
import { getProjectSessionsPath } from '../getProjectSessionsPath';
import { readMergedSettings } from '../settings';
import { readSessionAiTitles } from '../sessionAiTitles';
import { writeSessionTitleOverride } from '../sessionTitleOverrides';
import {
  MAX_TITLE_INPUT,
  buildSessionTitleRequest,
  cleanSessionTitle,
  generateSessionTitle,
} from '../session-title';

const mockPrint = vi.mocked(runClaudePrint);

describe('buildSessionTitleRequest', () => {
  it('wraps the prompt in message tags', () => {
    expect(buildSessionTitleRequest('  fix the login form  ')).toBe('<message>\nfix the login form\n</message>');
  });

  it('sends only the start of a long prompt, without splitting a character', () => {
    const request = buildSessionTitleRequest('😀'.repeat(MAX_TITLE_INPUT + 5));
    expect(request).toBe(`<message>\n${'😀'.repeat(MAX_TITLE_INPUT)}…\n</message>`);
  });
});

describe('cleanSessionTitle', () => {
  it('keeps a plain title', () => {
    expect(cleanSessionTitle('Fix login button on mobile')).toBe('Fix login button on mobile');
  });

  it('strips what small models add around it', () => {
    expect(cleanSessionTitle('"Fix login button"')).toBe('Fix login button');
    expect(cleanSessionTitle('Title: Fix login button.')).toBe('Fix login button');
    expect(cleanSessionTitle('## **Refactor API errors**')).toBe('Refactor API errors');
    expect(cleanSessionTitle('「ログイン修正」')).toBe('ログイン修正');
    expect(cleanSessionTitle('\n\nAdd dark mode\nBecause the user asked for it.')).toBe('Add dark mode');
  });

  it('cuts a runaway answer at a word', () => {
    const title = cleanSessionTitle('word '.repeat(40)) as string;
    expect(title.endsWith('…')).toBe(true);
    expect(Array.from(title).length).toBeLessThanOrEqual(81);
    expect(title).not.toContain('wor…');
  });

  it('gives nothing for an empty answer', () => {
    expect(cleanSessionTitle('  \n ')).toBeNull();
    expect(cleanSessionTitle('""')).toBeNull();
  });
});

describe('generateSessionTitle', () => {
  let sessionsPath: string;

  const transcript = (...lines: unknown[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  const user = (text: string) => ({
    type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-04T10:00:00Z',
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
  const assistant = {
    type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-04T10:00:05Z',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    sessionsPath = await mkdtemp(join(tmpdir(), 'session-title-'));
    vi.mocked(getProjectSessionsPath).mockResolvedValue(sessionsPath);
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: {}, overrides: [] });
    mockPrint.mockResolvedValue('Fix login form validation');
  });

  afterEach(async () => {
    await rm(sessionsPath, { recursive: true, force: true });
  });

  it('names a session after its first prompt and stores the name', async () => {
    await writeFile(join(sessionsPath, 's1.jsonl'), transcript(user('the login form accepts empty emails, fix it'), assistant));

    expect(await generateSessionTitle('/project', 's1')).toBe('Fix login form validation');
    expect(await readSessionAiTitles(sessionsPath)).toEqual({ s1: 'Fix login form validation' });

    const call = mockPrint.mock.calls[0]?.[0];
    expect(call?.prompt).toContain('the login form accepts empty emails, fix it');
    expect(call?.model).toBe('haiku');
    // Credentials follow the project; the CLI itself runs outside it.
    expect(call?.workingDir).toBe('/project');
    expect(call?.cwd).toBe(tmpdir());
  });

  it('does nothing when the setting is off', async () => {
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { aiSessionTitles: false }, overrides: [] });
    await writeFile(join(sessionsPath, 's1.jsonl'), transcript(user('fix it'), assistant));

    expect(await generateSessionTitle('/project', 's1')).toBeNull();
    expect(mockPrint).not.toHaveBeenCalled();
  });

  it('leaves a session that already has a name alone', async () => {
    await writeFile(join(sessionsPath, 'renamed.jsonl'), transcript(user('fix it'), assistant));
    await writeSessionTitleOverride(sessionsPath, 'renamed', 'My name');
    await writeFile(join(sessionsPath, 'cli.jsonl'), transcript(user('fix it'), assistant, { type: 'ai-title', aiTitle: 'CLI name', sessionId: 'cli' }));
    await writeFile(join(sessionsPath, 'command.jsonl'), transcript(user('<command-name>/init</command-name>'), assistant));

    expect(await generateSessionTitle('/project', 'renamed')).toBeNull();
    expect(await generateSessionTitle('/project', 'cli')).toBeNull();
    expect(await generateSessionTitle('/project', 'command')).toBeNull();
    expect(mockPrint).not.toHaveBeenCalled();
  });

  it('names a session only once', async () => {
    await writeFile(join(sessionsPath, 's1.jsonl'), transcript(user('fix it'), assistant));
    await generateSessionTitle('/project', 's1');
    expect(await generateSessionTitle('/project', 's1')).toBeNull();
    expect(mockPrint).toHaveBeenCalledTimes(1);
  });

  it('drops the title when the user renamed the session meanwhile', async () => {
    await writeFile(join(sessionsPath, 's1.jsonl'), transcript(user('fix it'), assistant));
    mockPrint.mockImplementation(async () => {
      await writeSessionTitleOverride(sessionsPath, 's1', 'Typed by hand');
      return 'Generated';
    });

    expect(await generateSessionTitle('/project', 's1')).toBeNull();
    expect(await readSessionAiTitles(sessionsPath)).toEqual({});
  });

  it('stores nothing when the model gives nothing usable', async () => {
    await writeFile(join(sessionsPath, 's1.jsonl'), transcript(user('fix it'), assistant));
    mockPrint.mockResolvedValue('   ');
    expect(await generateSessionTitle('/project', 's1')).toBeNull();
    expect(await readSessionAiTitles(sessionsPath)).toEqual({});
  });

  it('lets a failed call reach the caller', async () => {
    await writeFile(join(sessionsPath, 's1.jsonl'), transcript(user('fix it'), assistant));
    mockPrint.mockRejectedValue(new Error('claude timed out'));
    await expect(generateSessionTitle('/project', 's1')).rejects.toThrow('claude timed out');
    expect(await readSessionAiTitles(sessionsPath)).toEqual({});
  });
});
