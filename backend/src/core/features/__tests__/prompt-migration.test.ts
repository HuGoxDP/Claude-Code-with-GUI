import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  PROMPTS_TO_ENTITIES,
  ensureGlobalMigrated,
  ensureProjectMigrated,
  migrateKnownProjects,
  resetMigrationMemory,
  legacyGlobalFile,
  legacyProjectFile,
} from '../prompt-migration';
import { readPrompts, readPromptOrderByCategory, createPrompt, deletePrompt } from '../prompts';
import { listCategories } from '../prompt-category-registry';
import { SystemMigrationCollection } from '../../entities/system/SystemMigration.collection';
import { PromptItemCollection } from '../../entities/prompt/PromptItem.collection';

// The old files are written the way the previous version wrote them, and the
// move is checked against real directories: what matters is that every screen
// shows the same library after it, and that the old files are left untouched.

describe('prompt migration', () => {
  let ccgHome: string;
  let userHome: string;
  let projectDir: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    ccgHome = mkdtempSync(join(tmpdir(), 'ccg-entities-'));
    userHome = mkdtempSync(join(tmpdir(), 'ccg-userhome-'));
    projectDir = mkdtempSync(join(tmpdir(), 'ccg-proj-'));
    process.env.CCG_HOME = ccgHome;
    resetMigrationMemory();
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    for (const dir of [ccgHome, userHome, projectDir]) rmSync(dir, { recursive: true, force: true });
  });

  const options = () => ({ home: userHome });
  const write = (file: string, content: unknown) => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
  };
  const globalFile = () => legacyGlobalFile(options());
  const projectFile = () => legacyProjectFile(projectDir);
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

  const prompt = (id: string, createdAt: number, over: Record<string, unknown> = {}) => ({
    id,
    name: `name ${id}`,
    content: `content ${id}`,
    createdAt,
    updatedAt: createdAt + 5,
    ...over,
  });

  const names = async (scope: 'global' | 'project') =>
    (await readPrompts(scope, scope === 'project' ? projectDir : undefined)).map((p) => p.id);

  describe('the shared file', () => {
    it('does nothing and records nothing when there is no old file', async () => {
      expect(await ensureGlobalMigrated(options())).toEqual({ status: 'no-source' });
      expect(await new SystemMigrationCollection().all()).toEqual([]);
      expect(existsSync(join(ccgHome, 'entities'))).toBe(false);
    });

    it('moves prompts and categories and shows the same library as before', async () => {
      write(globalFile(), {
        prompts: [
          prompt('old', 1000, { categories: ['cat-b'] }),
          prompt('new', 3000, { categories: ['cat-a', 'cat-b'] }),
          prompt('mid', 2000),
        ],
        categories: [
          { id: 'cat-a', name: 'alpha', createdAt: 10 },
          { id: 'cat-b', name: 'beta', createdAt: 20 },
        ],
      });

      const outcome = await ensureGlobalMigrated(options());

      expect(outcome).toEqual({
        status: 'moved',
        promptCount: 3,
        categoryCount: 2,
        linkCount: 3,
        skippedCount: 0,
      });
      // Newest first, as the old screens listed them.
      expect(await names('global')).toEqual(['new', 'mid', 'old']);
      expect((await listCategories()).map((c) => [c.id, c.name])).toEqual([
        ['cat-a', 'alpha'],
        ['cat-b', 'beta'],
      ]);
      const read = await readPrompts('global');
      expect(read.find((p) => p.id === 'new')?.categories).toEqual(['cat-a', 'cat-b']);
      expect(read.find((p) => p.id === 'mid')?.categories).toBeUndefined();
      // Inside a category: the newest first, too.
      expect(await readPromptOrderByCategory('global')).toEqual({
        'cat-a': ['new'],
        'cat-b': ['new', 'old'],
      });
    });

    it('moves name, content and both times exactly as they were written', async () => {
      write(globalFile(), {
        prompts: [
          {
            id: 'p',
            name: '  머지 정리  ',
            content: '  본문\n둘째 줄  ',
            createdAt: 1700000000123,
            updatedAt: 1700000009999,
          },
        ],
      });
      await ensureGlobalMigrated(options());

      const [moved] = await readPrompts('global');
      expect(moved).toMatchObject({
        id: 'p',
        name: '  머지 정리  ',
        content: '  본문\n둘째 줄  ',
        createdAt: 1700000000123,
        updatedAt: 1700000009999,
      });
    });

    it('keeps the old id as the uuid and gives the row a fresh number', async () => {
      write(globalFile(), { prompts: [prompt('abc-123', 1)] });
      await ensureGlobalMigrated(options());

      const [item] = await new PromptItemCollection().inScope(null);
      expect(item?.uuid).toBe('abc-123');
      expect(item?.id).toBe(1);
      expect(item?.cwd).toBeNull();
    });

    it('leaves the old file exactly as it was', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)], categories: [{ id: 'c', name: 'c', createdAt: 1 }] });
      const before = hash(globalFile());

      await ensureGlobalMigrated(options());

      expect(hash(globalFile())).toBe(before);
    });

    it('skips what cannot be read and counts it', async () => {
      write(globalFile(), {
        prompts: [
          prompt('good', 1),
          { id: 'no-content', name: 'x' },
          'not an object',
          { name: 'no id', content: 'b' },
          prompt('good', 2), // an id seen twice
          prompt('pointing', 3, { categories: ['gone'] }),
        ],
      });

      const outcome = await ensureGlobalMigrated(options());

      expect(outcome).toMatchObject({ status: 'moved', promptCount: 2, linkCount: 0, skippedCount: 5 });
      expect(await names('global')).toEqual(['pointing', 'good']);
      expect((await readPrompts('global')).find((p) => p.id === 'pointing')?.categories).toBeUndefined();
    });

    it('reads a missing createdAt as 0, which lists the prompt last', async () => {
      write(globalFile(), {
        prompts: [{ id: 'undated', name: 'n', content: 'c' }, prompt('dated', 5)],
      });
      await ensureGlobalMigrated(options());

      expect(await names('global')).toEqual(['dated', 'undated']);
    });

    it('records what it did', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)] });
      await ensureGlobalMigrated(options());

      const [record] = await new SystemMigrationCollection().all();
      expect(record).toMatchObject({
        name: PROMPTS_TO_ENTITIES,
        cwd: null,
        sourceFile: globalFile(),
        promptCount: 1,
      });
      expect(record?.ranAt).toBeGreaterThan(0);
    });

    it('does not move again once it has, so a deleted prompt stays deleted', async () => {
      write(globalFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });
      await ensureGlobalMigrated(options());
      await deletePrompt('global', undefined, 'a');

      resetMigrationMemory(); // a new process
      expect(await ensureGlobalMigrated(options())).toEqual({ status: 'already-moved' });
      expect(await names('global')).toEqual(['b']);
    });

    it('adds no row twice when it runs again without a record', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)], categories: [{ id: 'c', name: 'c', createdAt: 1 }] });
      await ensureGlobalMigrated(options());
      // As if the run had been cut off before the record was written.
      const migrations = new SystemMigrationCollection();
      for (const record of await migrations.all()) await migrations.delete(record.id);
      resetMigrationMemory();

      await ensureGlobalMigrated(options());

      expect(await names('global')).toEqual(['a']);
      expect(await listCategories()).toHaveLength(1);
    });

    it('moves only what is missing after a run that was cut off half way', async () => {
      write(globalFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });
      // The first prompt had been written when the process ended.
      await new PromptItemCollection().create({
        cwd: null,
        uuid: 'a',
        name: 'name a',
        content: 'content a',
        priority: 2,
        createdAt: 1,
        updatedAt: 6,
      });

      await ensureGlobalMigrated(options());

      expect(await names('global')).toEqual(['b', 'a']);
    });

    it('shares one run between requests that arrive together', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)] });

      const outcomes = await Promise.all([
        ensureGlobalMigrated(options()),
        ensureGlobalMigrated(options()),
        ensureGlobalMigrated(options()),
      ]);

      expect(outcomes.filter((o) => o.status === 'moved')).toHaveLength(3);
      expect(await new SystemMigrationCollection().all()).toHaveLength(1);
      expect(await names('global')).toEqual(['a']);
    });

    it('refuses, and records nothing, when the old file is not JSON', async () => {
      write(globalFile(), '{"prompts": [');

      await expect(ensureGlobalMigrated(options())).rejects.toThrow();
      expect(await new SystemMigrationCollection().all()).toEqual([]);
    });

    it('refuses to write over an entity file it cannot read', async () => {
      write(globalFile(), { prompts: [prompt('a', 1)] });
      write(join(ccgHome, 'entities', 'prompt', 'prompt_items.entity.json'), '[][]');

      await expect(ensureGlobalMigrated(options())).rejects.toThrow();
      expect(await new SystemMigrationCollection().all()).toEqual([]);
    });

    it('moves an empty old file and records it', async () => {
      write(globalFile(), '');
      expect(await ensureGlobalMigrated(options())).toMatchObject({ status: 'moved', promptCount: 0 });
    });
  });

  describe('a project file', () => {
    it('moves a project\'s prompts under its cwd, leaving the shared ones alone', async () => {
      write(globalFile(), { prompts: [prompt('shared', 1)] });
      write(projectFile(), { prompts: [prompt('mine-old', 10), prompt('mine-new', 20)] });

      const outcome = await ensureProjectMigrated(projectDir, options());

      expect(outcome).toMatchObject({ status: 'moved', promptCount: 2 });
      expect(await names('project')).toEqual(['mine-new', 'mine-old']);
      expect(await names('global')).toEqual(['shared']);
    });

    it('moves the shared file first, even when only a project was asked for', async () => {
      write(globalFile(), { prompts: [prompt('shared', 1)] });
      write(projectFile(), { prompts: [prompt('mine', 10)] });

      await ensureProjectMigrated(projectDir, options());

      expect(await names('global')).toEqual(['shared']);
    });

    it('files a project prompt under the shared category its old id named', async () => {
      write(globalFile(), { prompts: [], categories: [{ id: 'cat', name: 'review', createdAt: 1 }] });
      write(projectFile(), { prompts: [prompt('mine', 10, { categories: ['cat'] })] });

      await ensureProjectMigrated(projectDir, options());

      expect((await readPrompts('project', projectDir))[0]?.categories).toEqual(['cat']);
      expect(await readPromptOrderByCategory('project', projectDir)).toEqual({ cat: ['mine'] });
      expect(await readPromptOrderByCategory('global')).toEqual({});
    });

    it('keeps the same prompt id in two projects apart', async () => {
      const other = mkdtempSync(join(tmpdir(), 'ccg-proj2-'));
      try {
        write(projectFile(), { prompts: [prompt('same', 1, { name: 'first' })] });
        write(legacyProjectFile(other), { prompts: [prompt('same', 1, { name: 'second' })] });

        await ensureProjectMigrated(projectDir, options());
        await ensureProjectMigrated(other, options());

        expect((await readPrompts('project', projectDir))[0]?.name).toBe('first');
        expect((await readPrompts('project', other))[0]?.name).toBe('second');
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });

    it('records nothing for a project that has no old file, so a later one is still found', async () => {
      expect(await ensureProjectMigrated(projectDir, options())).toEqual({ status: 'no-source' });
      expect(
        (await new SystemMigrationCollection().all()).filter((r) => r.cwd !== null),
      ).toEqual([]);

      write(projectFile(), { prompts: [prompt('late', 1)] });
      resetMigrationMemory();
      expect(await ensureProjectMigrated(projectDir, options())).toMatchObject({ status: 'moved' });
    });

    it('does not move a project twice', async () => {
      write(projectFile(), { prompts: [prompt('a', 1)] });
      await ensureProjectMigrated(projectDir, options());
      resetMigrationMemory();

      expect(await ensureProjectMigrated(projectDir, options())).toEqual({ status: 'already-moved' });
      expect(await names('project')).toEqual(['a']);
    });

    it('leaves the old project file exactly as it was', async () => {
      write(projectFile(), { prompts: [prompt('a', 1)] });
      const before = hash(projectFile());
      await ensureProjectMigrated(projectDir, options());
      expect(hash(projectFile())).toBe(before);
    });

    it('does not put a new prompt of the same project on top of the moved ones out of order', async () => {
      write(projectFile(), { prompts: [prompt('a', 1), prompt('b', 2)] });
      await ensureProjectMigrated(projectDir, options());

      await createPrompt('project', projectDir, 'fresh', 'body');

      expect((await readPrompts('project', projectDir)).map((p) => p.name)).toEqual([
        'fresh',
        'name b',
        'name a',
      ]);
    });
  });

  describe('the known projects', () => {
    it('moves every project that has an old file and counts the rest', async () => {
      const second = mkdtempSync(join(tmpdir(), 'ccg-proj3-'));
      const empty = mkdtempSync(join(tmpdir(), 'ccg-proj4-'));
      try {
        write(projectFile(), { prompts: [prompt('a', 1)] });
        write(legacyProjectFile(second), { prompts: [prompt('b', 1)] });

        const summary = await migrateKnownProjects([projectDir, second, empty, projectDir], options());

        expect(summary).toEqual({ checked: 3, moved: 2, failed: 0 });
      } finally {
        rmSync(second, { recursive: true, force: true });
        rmSync(empty, { recursive: true, force: true });
      }
    });

    it('goes on past a project whose file is broken', async () => {
      const broken = mkdtempSync(join(tmpdir(), 'ccg-proj5-'));
      try {
        write(legacyProjectFile(broken), '{"prompts": [');
        write(projectFile(), { prompts: [prompt('a', 1)] });

        const summary = await migrateKnownProjects([broken, projectDir], options());

        expect(summary).toEqual({ checked: 2, moved: 1, failed: 1 });
        expect(await names('project')).toEqual(['a']);
      } finally {
        rmSync(broken, { recursive: true, force: true });
      }
    });
  });
});
