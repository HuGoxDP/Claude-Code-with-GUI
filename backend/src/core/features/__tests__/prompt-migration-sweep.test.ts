import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  PROMPTS_HOME_SWEEP,
  SweepOptions,
  findProjectsWithPromptFiles,
  resetBackgroundMigration,
  startBackgroundMigration,
  stopBackgroundMigration,
  sweepHomeForPromptFiles,
} from '../prompt-migration-sweep';
import { resetMigrationMemory } from '../prompt-migration';
import { readPrompts } from '../prompts';
import { SystemMigrationCollection } from '../../entities/system/SystemMigration.collection';

// The home folder here is a made-up tree: the machine this was written on has no
// project prompt files at all, so a pass over the real one would prove nothing.

describe('prompt migration sweep', () => {
  let ccgHome: string;
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    ccgHome = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-sweep-entities-')));
    home = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-sweep-home-')));
    process.env.CCG_HOME = ccgHome;
    resetMigrationMemory();
    resetBackgroundMigration();
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    for (const dir of [ccgHome, home]) {
      try {
        chmodSync(join(dir, 'locked'), 0o755);
      } catch {
        // nothing was locked
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const promptFile = (id: string) =>
    JSON.stringify({ prompts: [{ id, name: `name ${id}`, content: 'c', createdAt: 1, updatedAt: 1 }] });
  /** Plant an old project prompt file under [relative] and answer the project folder. */
  const plant = (relative: string, id = relative.replace(/\W/g, '-')) => {
    const project = join(home, relative);
    mkdirSync(join(project, '.claude-code-gui'), { recursive: true });
    writeFileSync(join(project, '.claude-code-gui', 'prompts.json'), promptFile(id), 'utf-8');
    return project;
  };
  const found = async (platform: NodeJS.Platform = 'linux') =>
    (await findProjectsWithPromptFiles(home, new SweepOptions(undefined, platform))).projects.sort();

  describe('finding project files', () => {
    it('finds a project at any depth', async () => {
      const shallow = plant('proj-a');
      const deep = plant('work/clients/acme/proj-b');

      expect(await found()).toEqual([deep, shallow].sort());
    });

    it('does not count the shared store directly under home as a project', async () => {
      mkdirSync(join(home, '.claude-code-gui'), { recursive: true });
      writeFileSync(join(home, '.claude-code-gui', 'prompts.json'), promptFile('shared'), 'utf-8');

      expect(await found()).toEqual([]);
    });

    it('ignores a folder with a .claude-code-gui but no prompt file', async () => {
      mkdirSync(join(home, 'proj', '.claude-code-gui'), { recursive: true });
      writeFileSync(join(home, 'proj', '.claude-code-gui', 'settings.json'), '{}', 'utf-8');

      expect(await found()).toEqual([]);
    });

    it.each(['node_modules', '.git', 'Library', '.cache', '.gradle', '.claude'])(
      'does not look inside %s',
      async (heavy) => {
        plant(`${heavy}/pkg/proj`);

        expect(await found()).toEqual([]);
      },
    );

    it('does not look inside Desktop, Documents and Downloads on macOS', async () => {
      for (const guarded of ['Desktop', 'Documents', 'Downloads']) plant(`${guarded}/proj`);

      expect(await found('darwin')).toEqual([]);
    });

    it('does look inside them everywhere else, where nothing guards them', async () => {
      const inDocuments = plant('Documents/proj');

      expect(await found('win32')).toEqual([inDocuments]);
      expect(await found('linux')).toEqual([inDocuments]);
    });

    it('guards those three only directly under home', async () => {
      const nested = plant('work/Documents/proj');

      expect(await found('darwin')).toEqual([nested]);
    });

    it('finds a project once however many links lead to it', async () => {
      const project = plant('real/proj');
      symlinkSync(join(home, 'real'), join(home, 'alias'));
      symlinkSync(join(home, 'real', 'proj'), join(home, 'direct'));

      expect(await found()).toEqual([project]);
    });

    // The answer is the same list either way, so what shows the saving is how many
    // folders were looked into: a second way into a folder must not cost a second look.
    const visits = async () => {
      let count = 0;
      await findProjectsWithPromptFiles(home, new SweepOptions(undefined, 'linux'), () => {
        count += 1;
      });
      return count;
    };

    it('looks into a folder once however many links lead to it', async () => {
      plant('real/proj');
      const alone = await visits();

      symlinkSync(join(home, 'real'), join(home, 'alias'));
      symlinkSync(join(home, 'real'), join(home, 'another'));

      expect(await visits()).toBe(alone);
    });

    it('looks into nothing more for a link that points back up', async () => {
      plant('work/proj');
      const alone = await visits();

      symlinkSync(home, join(home, 'work', 'loop'));

      expect(await visits()).toBe(alone);
    });

    it('does not circle on a link that points back up', async () => {
      const project = plant('work/proj');
      symlinkSync(home, join(home, 'work', 'loop'));

      expect(await found()).toEqual([project]);
    });

    it('goes past a link to nothing', async () => {
      const project = plant('proj');
      symlinkSync(join(home, 'gone'), join(home, 'dangling'));

      expect(await found()).toEqual([project]);
    });

    it('goes past a folder it is not allowed to read', async () => {
      const project = plant('proj');
      mkdirSync(join(home, 'locked', 'inner'), { recursive: true });
      chmodSync(join(home, 'locked'), 0o000);

      expect(await found()).toEqual([project]);
    });

    it('stops between folders when asked, and says it did not finish', async () => {
      plant('a/proj');
      let polls = 0;

      const result = await findProjectsWithPromptFiles(home, new SweepOptions(undefined, 'linux', () => ++polls > 1));

      expect(result.completed).toBe(false);
    });
  });

  describe('a pass', () => {
    it('moves every project it finds and records that it finished', async () => {
      plant('one', 'p1');
      plant('two/three', 'p2');

      const summary = await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));

      expect(summary).toMatchObject({ found: 2, moved: 2, failed: 0, completed: true });
      const [record] = (await new SystemMigrationCollection().all()).filter(
        (r) => r.name === PROMPTS_HOME_SWEEP,
      );
      expect(record).toMatchObject({ cwd: null, sourceFile: home, promptCount: 2 });
      expect((await readPrompts('project', join(home, 'one'))).map((p) => p.id)).toEqual(['p1']);
      expect((await readPrompts('project', join(home, 'two', 'three'))).map((p) => p.id)).toEqual(['p2']);
    });

    it('moves the shared data first, so a project\'s categories are there to point at', async () => {
      mkdirSync(join(home, '.claude-code-gui'), { recursive: true });
      writeFileSync(
        join(home, '.claude-code-gui', 'prompts.json'),
        JSON.stringify({ prompts: [], categories: [{ id: 'cat', name: 'review', createdAt: 1 }] }),
        'utf-8',
      );
      const project = join(home, 'proj');
      mkdirSync(join(project, '.claude-code-gui'), { recursive: true });
      writeFileSync(
        join(project, '.claude-code-gui', 'prompts.json'),
        JSON.stringify({
          prompts: [{ id: 'p', name: 'n', content: 'c', createdAt: 1, updatedAt: 1, categories: ['cat'] }],
        }),
        'utf-8',
      );

      await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));

      expect((await readPrompts('project', project))[0]?.categories).toEqual(['cat']);
    });

    it('does nothing the second time, because a finished pass is on record', async () => {
      plant('one');
      await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));
      resetMigrationMemory();

      const again = await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));

      expect(again).toEqual({ visited: 0, found: 0, moved: 0, failed: 0, completed: true });
    });

    it('leaves no record when it was stopped, so the next pass starts over', async () => {
      plant('one');

      const summary = await sweepHomeForPromptFiles(new SweepOptions(home, 'linux', () => true));

      expect(summary.completed).toBe(false);
      const sweeps = (await new SystemMigrationCollection().all()).filter(
        (r) => r.name === PROMPTS_HOME_SWEEP,
      );
      expect(sweeps).toEqual([]);

      const next = await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));
      expect(next).toMatchObject({ moved: 1, completed: true });
    });

    it('leaves no record when a project could not be moved, so that project is tried again', async () => {
      const project = plant('good');
      const broken = join(home, 'broken');
      mkdirSync(join(broken, '.claude-code-gui'), { recursive: true });
      writeFileSync(join(broken, '.claude-code-gui', 'prompts.json'), '{"prompts": [', 'utf-8');

      const summary = await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));

      expect(summary).toMatchObject({ found: 2, moved: 1, failed: 1, completed: false });
      expect(
        (await new SystemMigrationCollection().all()).filter((r) => r.name === PROMPTS_HOME_SWEEP),
      ).toEqual([]);
      expect((await readPrompts('project', project)).length).toBe(1);
    });

    it('does not add rows for a project that was already moved when it was opened', async () => {
      const project = plant('one', 'p1');
      const { ensureProjectMigrated } = await import('../prompt-migration');
      await ensureProjectMigrated(project, { home });
      resetMigrationMemory();

      const summary = await sweepHomeForPromptFiles(new SweepOptions(home, 'linux'));

      expect(summary).toMatchObject({ found: 1, moved: 0, failed: 0, completed: true });
      expect((await readPrompts('project', project)).map((p) => p.id)).toEqual(['p1']);
    });
  });

  describe('starting it in the background', () => {
    const settle = async () => {
      for (let i = 0; i < 200; i += 1) {
        const done = (await new SystemMigrationCollection().all()).some(
          (r) => r.name === PROMPTS_HOME_SWEEP,
        );
        if (done) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    it('moves the known projects and then sweeps, without being waited for', async () => {
      const known = plant('known', 'k');
      plant('unknown', 'u');

      startBackgroundMigration(async () => [known], new SweepOptions(home, 'linux'));
      await settle();

      expect((await readPrompts('project', known)).map((p) => p.id)).toEqual(['k']);
      expect((await readPrompts('project', join(home, 'unknown'))).map((p) => p.id)).toEqual(['u']);
    });

    it('starts only once per process', async () => {
      let asked = 0;
      const list = async () => {
        asked += 1;
        return [];
      };

      startBackgroundMigration(list, new SweepOptions(home, 'linux'));
      startBackgroundMigration(list, new SweepOptions(home, 'linux'));
      await settle();

      expect(asked).toBe(1);
    });

    it('stops at the next folder when told to', async () => {
      plant('a/b/c/proj');
      stopBackgroundMigration();

      startBackgroundMigration(async () => [], new SweepOptions(home, 'linux'));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(
        (await new SystemMigrationCollection().all()).filter((r) => r.name === PROMPTS_HOME_SWEEP),
      ).toEqual([]);
    });

    it('survives a list of known projects that cannot be read', async () => {
      startBackgroundMigration(
        async () => {
          throw new Error('no projects directory');
        },
        new SweepOptions(home, 'linux'),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(await readPrompts('global')).toEqual([]);
    });
  });
});
