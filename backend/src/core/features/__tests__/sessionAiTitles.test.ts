import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  displayTitle,
  readSessionAiTitles,
  removeSessionAiTitle,
  writeSessionAiTitle,
} from '../sessionAiTitles';

const AI_TITLES_FILE = '.claude-code-gui-ai-titles.json';

describe('displayTitle', () => {
  it('lets a rename made here win over everything', () => {
    expect(displayTitle({ title: 'Renamed in CLI', titleSource: 'custom-title' }, 'Mine', 'Generated')).toBe('Mine');
  });

  it('stands in for the first prompt and a summary, as the CLI\'s own title would', () => {
    expect(displayTitle({ title: 'fix the thing pls', titleSource: 'prompt' }, undefined, 'Fix login form')).toBe('Fix login form');
    expect(displayTitle({ title: 'Auto summary', titleSource: 'summary' }, undefined, 'Fix login form')).toBe('Fix login form');
  });

  it('never covers a name Claude Code recorded itself', () => {
    for (const titleSource of ['agent-name', 'custom-title', 'ai-title'] as const) {
      expect(displayTitle({ title: 'From the CLI', titleSource }, undefined, 'Generated')).toBe('From the CLI');
    }
  });

  it('keeps the session\'s own title when nothing else is known', () => {
    expect(displayTitle({ title: 'First prompt', titleSource: 'prompt' })).toBe('First prompt');
  });
});

describe('sessionAiTitles store', () => {
  let sessionsPath: string;

  beforeEach(async () => {
    sessionsPath = await mkdtemp(join(tmpdir(), 'session-ai-titles-'));
  });

  afterEach(async () => {
    await rm(sessionsPath, { recursive: true, force: true });
  });

  it('reads nothing from a missing or broken file', async () => {
    expect(await readSessionAiTitles(sessionsPath)).toEqual({});
    await writeFile(join(sessionsPath, AI_TITLES_FILE), 'not json', 'utf-8');
    expect(await readSessionAiTitles(sessionsPath)).toEqual({});
  });

  it('writes, reads back and removes one session at a time', async () => {
    await writeSessionAiTitle(sessionsPath, 's1', 'Fix login form');
    await writeSessionAiTitle(sessionsPath, 's2', 'Add dark mode');
    expect(await readSessionAiTitles(sessionsPath)).toEqual({ s1: 'Fix login form', s2: 'Add dark mode' });

    await removeSessionAiTitle(sessionsPath, 's1');
    expect(await readSessionAiTitles(sessionsPath)).toEqual({ s2: 'Add dark mode' });
  });

  it('refuses to replace a file it cannot read, so other titles survive', async () => {
    await writeFile(join(sessionsPath, AI_TITLES_FILE), '{ "s1": "Kept", ', 'utf-8');
    await expect(writeSessionAiTitle(sessionsPath, 's2', 'New')).rejects.toThrow();
    expect(await readFile(join(sessionsPath, AI_TITLES_FILE), 'utf-8')).toBe('{ "s1": "Kept", ');
  });
});
