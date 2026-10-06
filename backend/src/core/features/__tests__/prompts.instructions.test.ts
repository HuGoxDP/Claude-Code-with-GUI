import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createPrompt, readPromptContentForProject } from '../prompts';

// A new conversation can start with a saved prompt as its instructions. The
// lookup answers with what a chat in that project can see in the library:
// global prompts and the project's own, never another project's.
describe('readPromptContentForProject', () => {
  let home: string;
  let projectA: string;
  let projectB: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = mkdtempSync(join(tmpdir(), 'ccg-home-'));
    projectA = mkdtempSync(join(tmpdir(), 'ccg-project-a-'));
    projectB = mkdtempSync(join(tmpdir(), 'ccg-project-b-'));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    for (const dir of [home, projectA, projectB]) rmSync(dir, { recursive: true, force: true });
  });

  const idOf = async (result: Awaited<ReturnType<typeof createPrompt>>) => {
    if (result.status !== 'ok') throw new Error(result.error);
    return result.prompt.id;
  };

  it('finds a global prompt from any project', async () => {
    const id = await idOf(await createPrompt('global', undefined, 'Reviewer', 'Review like a senior engineer.'));
    expect(await readPromptContentForProject(id, projectA)).toBe('Review like a senior engineer.');
    expect(await readPromptContentForProject(id, projectB)).toBe('Review like a senior engineer.');
  });

  it('finds a project prompt only in its own project', async () => {
    const id = await idOf(await createPrompt('project', projectA, 'Style', 'Use tabs.'));
    expect(await readPromptContentForProject(id, projectA)).toBe('Use tabs.');
    expect(await readPromptContentForProject(id, projectB)).toBeNull();
  });

  it('answers null for an id that is not one of ours or no longer exists', async () => {
    expect(await readPromptContentForProject('../../etc/passwd', projectA)).toBeNull();
    expect(await readPromptContentForProject('0b0e6a8e-0000-4000-8000-000000000000', projectA)).toBeNull();
  });
});
