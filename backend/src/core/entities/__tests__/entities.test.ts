import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EntityFileUnreadableError } from '../AbstractEntityCollection';
import { PromptItem, type PromptItemRow } from '../prompt/PromptItem.entity';
import { PromptItemCollection } from '../prompt/PromptItem.collection';
import { PromptCategoryCollection } from '../prompt/PromptCategory.collection';
import { PromptCategoryItemLinkCollection } from '../prompt/PromptCategoryItemLink.collection';
import { SystemSequenceCollection } from '../system/SystemSequence.collection';
import { SystemMigrationCollection } from '../system/SystemMigration.collection';

const NOW = 1_700_000_000_000;

const itemAttributes = (
  overrides: Partial<Omit<PromptItemRow, 'id'>> = {},
): Omit<PromptItemRow, 'id'> => ({
  cwd: null,
  uuid: 'uuid-1',
  name: 'review',
  content: 'Review the diff.',
  priority: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('entities', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = realpathSync(mkdtempSync(join(tmpdir(), 'entities-')));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  const fileOf = (domain: string, table: string) =>
    join(home, 'entities', domain, `${table}.entity.json`);
  const readRows = (domain: string, table: string) =>
    JSON.parse(readFileSync(fileOf(domain, table), 'utf-8')) as Record<string, unknown>[];
  const plant = (domain: string, table: string, content: string) => {
    mkdirSync(join(home, 'entities', domain), { recursive: true });
    writeFileSync(fileOf(domain, table), content, 'utf-8');
  };

  describe('where each table lives', () => {
    // Entity, table and file are one thing named three ways, and the folder is the
    // domain. The same tree is used for the class files.
    it.each([
      [new PromptItemCollection(), 'prompt', 'prompt_items'],
      [new PromptCategoryCollection(), 'prompt', 'prompt_categories'],
      [new PromptCategoryItemLinkCollection(), 'prompt', 'prompt_category_item_links'],
      [new SystemSequenceCollection(), 'system', 'system_sequences'],
      [new SystemMigrationCollection(), 'system', 'system_migrations'],
    ])('keeps %o in %s/%s.entity.json', (collection, domain, table) => {
      expect(collection.filePath).toBe(fileOf(domain, table));
      expect(collection.domain).toBe(domain);
      expect(collection.table).toBe(table);
    });

    it('prefixes every table with its domain', () => {
      for (const [collection, domain] of [
        [new PromptItemCollection(), 'prompt'],
        [new SystemMigrationCollection(), 'system'],
      ] as const) {
        expect(collection.table.startsWith(`${domain}_`)).toBe(true);
      }
    });
  });

  describe('creating a row', () => {
    it('numbers rows from 1 and writes a JSON array', async () => {
      const items = new PromptItemCollection();

      const first = await items.create(itemAttributes({ uuid: 'a', name: 'one' }));
      const second = await items.create(itemAttributes({ uuid: 'b', name: 'two' }));

      expect([first.id, second.id]).toEqual([1, 2]);
      const rows = readRows('prompt', 'prompt_items');
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.map((row) => row.name)).toEqual(['one', 'two']);
    });

    // "The highest id plus one" would hand a deleted row's id to the next row, and
    // whatever still pointed at the deleted one would point at a stranger.
    it('never gives out an id again after the row was deleted', async () => {
      const items = new PromptItemCollection();
      await items.create(itemAttributes({ uuid: 'a' }));
      const second = await items.create(itemAttributes({ uuid: 'b' }));

      await items.delete(second.id);
      const third = await items.create(itemAttributes({ uuid: 'c' }));

      expect(third.id).toBe(3);
    });

    it('numbers each table on its own', async () => {
      const items = new PromptItemCollection();
      const categories = new PromptCategoryCollection();
      await items.create(itemAttributes());
      await items.create(itemAttributes({ uuid: 'b' }));

      const category = await categories.create({
        cwd: null,
        uuid: 'c1',
        name: 'Review',
        priority: 1,
        createdAt: NOW,
      });

      expect(category.id).toBe(1);
    });

    it('records the last id of each table in the sequence file', async () => {
      const items = new PromptItemCollection();
      await items.create(itemAttributes());
      await items.create(itemAttributes({ uuid: 'b' }));

      const sequences = readRows('system', 'system_sequences');
      expect(sequences).toHaveLength(1);
      expect(sequences[0]).toMatchObject({ tableName: 'prompt_items', lastId: 2, cwd: null });
    });

    // A file someone filled by hand has ids the sequence never handed out.
    it('starts above the highest id already in the file', async () => {
      plant(
        'prompt',
        'prompt_items',
        JSON.stringify([{ ...itemAttributes({ uuid: 'old' }), id: 7 }]),
      );

      const created = await new PromptItemCollection().create(itemAttributes({ uuid: 'new' }));

      expect(created.id).toBe(8);
    });

    it('normalizes the cwd before writing it', async () => {
      const project = join(home, 'project');
      mkdirSync(project);

      const created = await new PromptItemCollection().create(
        itemAttributes({ cwd: `${project}/` }),
      );

      expect(created.cwd).toBe(project);
      expect(readRows('prompt', 'prompt_items')[0].cwd).toBe(project);
    });

    it('numbers ten rows created at once without a repeat or a loss', async () => {
      const items = new PromptItemCollection();

      const created = await Promise.all(
        Array.from({ length: 10 }, (_, i) => items.create(itemAttributes({ uuid: `u${i}` }))),
      );

      expect(new Set(created.map((item) => item.id)).size).toBe(10);
      expect(readRows('prompt', 'prompt_items')).toHaveLength(10);
    });
  });

  describe('creating several rows at once', () => {
    const sameUuid = (stored: PromptItemRow, candidate: Omit<PromptItemRow, 'id'>) =>
      stored.uuid === candidate.uuid;

    it('numbers a block of rows in one run, lowest first', async () => {
      const items = new PromptItemCollection();
      const added = await items.createMissing(
        [itemAttributes({ uuid: 'a' }), itemAttributes({ uuid: 'b' }), itemAttributes({ uuid: 'c' })],
        sameUuid,
      );

      expect(added.map((item) => [item.uuid, item.id])).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      expect(readRows('prompt', 'prompt_items')).toHaveLength(3);
    });

    it('adds only the candidates no stored row stands for', async () => {
      const items = new PromptItemCollection();
      await items.create(itemAttributes({ uuid: 'a' }));

      const added = await items.createMissing(
        [itemAttributes({ uuid: 'a' }), itemAttributes({ uuid: 'b' })],
        sameUuid,
      );

      expect(added.map((item) => item.uuid)).toEqual(['b']);
      expect((await items.all()).map((item) => item.uuid)).toEqual(['a', 'b']);
    });

    it('never gives a number out twice, even for rows it did not add', async () => {
      const items = new PromptItemCollection();
      await items.createMissing([itemAttributes({ uuid: 'a' })], sameUuid);
      await items.createMissing([itemAttributes({ uuid: 'a' })], sameUuid); // costs number 2
      const [third] = await items.createMissing([itemAttributes({ uuid: 'c' })], sameUuid);

      expect(third?.id).toBe(3);
    });

    it('writes nothing when every candidate is already there', async () => {
      const items = new PromptItemCollection();
      await items.create(itemAttributes({ uuid: 'a' }));
      const before = readFileSync(fileOf('prompt', 'prompt_items'), 'utf-8');

      expect(await items.createMissing([itemAttributes({ uuid: 'a' })], sameUuid)).toEqual([]);
      expect(readFileSync(fileOf('prompt', 'prompt_items'), 'utf-8')).toBe(before);
    });

    it('answers nothing for no candidates', async () => {
      expect(await new PromptItemCollection().createMissing([], sameUuid)).toEqual([]);
    });
  });

  describe('reading rows', () => {
    it('reads an absent file as no rows', async () => {
      expect(await new PromptItemCollection().all()).toEqual([]);
    });

    it('answers an entity instance, not a plain object', async () => {
      const items = new PromptItemCollection();
      await items.create(itemAttributes());

      const [item] = await items.all();

      expect(item).toBeInstanceOf(PromptItem);
      expect(item.name).toBe('review');
    });

    it('finds a row by id, and answers null for one that is not there', async () => {
      const items = new PromptItemCollection();
      const created = await items.create(itemAttributes());

      expect((await items.find(created.id))?.uuid).toBe('uuid-1');
      expect(await items.find(99)).toBeNull();
    });

    it('serialises an entity as its row', async () => {
      const created = await new PromptItemCollection().create(itemAttributes());

      expect(JSON.parse(JSON.stringify(created))).toEqual({ ...itemAttributes(), id: 1 });
    });

    it('reads a missing cwd as null', async () => {
      const { cwd: _cwd, ...withoutCwd } = { ...itemAttributes(), id: 1 };
      plant('prompt', 'prompt_items', JSON.stringify([withoutCwd]));

      const [item] = await new PromptItemCollection().all();

      expect(item.cwd).toBeNull();
      expect(item.isGlobal).toBe(true);
    });

    it('lists one project\'s prompts, or the shared ones, in the library\'s order', async () => {
      const project = join(home, 'project');
      mkdirSync(project);
      const items = new PromptItemCollection();
      await items.create(itemAttributes({ uuid: 'a', name: 'b-shared', priority: 2 }));
      await items.create(itemAttributes({ uuid: 'b', name: 'a-shared', priority: 1 }));
      await items.create(itemAttributes({ uuid: 'c', name: 'project', cwd: project, priority: 1 }));

      expect((await items.inScope(null)).map((item) => item.name)).toEqual(['a-shared', 'b-shared']);
      expect((await items.inScope(`${project}/`)).map((item) => item.name)).toEqual(['project']);
    });
  });

  describe('changing and removing rows', () => {
    it('changes some columns of one row and leaves the rest', async () => {
      const items = new PromptItemCollection();
      const created = await items.create(itemAttributes());

      const updated = await items.update(created.id, { name: 'renamed', updatedAt: NOW + 5 });

      expect(updated?.name).toBe('renamed');
      expect(updated?.content).toBe('Review the diff.');
      expect((await items.find(created.id))?.updatedAt).toBe(NOW + 5);
    });

    it('never changes an id', async () => {
      const items = new PromptItemCollection();
      const created = await items.create(itemAttributes());

      const updated = await items.update(created.id, { id: 99 } as Partial<Omit<PromptItemRow, 'id'>>);

      expect(updated?.id).toBe(created.id);
    });

    it('answers null for a row that is not there', async () => {
      expect(await new PromptItemCollection().update(5, { name: 'x' })).toBeNull();
    });

    it('removes one row and says whether there was one', async () => {
      const items = new PromptItemCollection();
      const created = await items.create(itemAttributes());

      expect(await items.delete(created.id)).toBe(true);
      expect(await items.delete(created.id)).toBe(false);
      expect(await items.all()).toEqual([]);
    });
  });

  describe('a file that cannot be read', () => {
    // Answering "empty" would look like every row was lost, and the next write
    // would then replace the file with that.
    it('refuses to read rather than answering empty', async () => {
      plant('prompt', 'prompt_items', '[{"id":1}{"id":2}]'); // what a torn write leaves

      await expect(new PromptItemCollection().all()).rejects.toBeInstanceOf(EntityFileUnreadableError);
    });

    it('leaves the file exactly as it found it when asked to write', async () => {
      const torn = '[{"id":1}{"id":2}]';
      plant('prompt', 'prompt_items', torn);

      await expect(new PromptItemCollection().create(itemAttributes())).rejects.toBeInstanceOf(Error);

      expect(readFileSync(fileOf('prompt', 'prompt_items'), 'utf-8')).toBe(torn);
    });

    it('treats a file whose root is an object as unreadable, not as empty', async () => {
      plant('prompt', 'prompt_items', '{"prompts":[]}');

      await expect(new PromptItemCollection().all()).rejects.toBeInstanceOf(EntityFileUnreadableError);
    });

    it('treats an empty file as no rows', async () => {
      plant('prompt', 'prompt_items', '');

      expect(await new PromptItemCollection().all()).toEqual([]);
    });
  });

  describe('rows that fail the column check', () => {
    const good = { ...itemAttributes({ uuid: 'good' }), id: 1 };

    it('skips a malformed row when reading', async () => {
      plant('prompt', 'prompt_items', JSON.stringify([good, { id: 2, name: 7 }]));

      expect((await new PromptItemCollection().all()).map((item) => item.uuid)).toEqual(['good']);
    });

    // Reading must not quietly edit a store. A row from a newer version, or one a
    // person mangled by hand, has to survive our next save.
    it('writes a skipped row back untouched when it saves', async () => {
      const mangled = { id: 2, name: 7, note: 'keep me' };
      plant('prompt', 'prompt_items', JSON.stringify([good, mangled]));

      await new PromptItemCollection().create(itemAttributes({ uuid: 'new' }));

      const rows = readRows('prompt', 'prompt_items');
      expect(rows).toHaveLength(3);
      expect(rows).toContainEqual(mangled);
    });

    it('skips a second row that reuses an id, and keeps it too', async () => {
      const clash = { ...itemAttributes({ uuid: 'clash' }), id: 1 };
      plant('prompt', 'prompt_items', JSON.stringify([good, clash]));

      const items = new PromptItemCollection();
      expect((await items.all()).map((item) => item.uuid)).toEqual(['good']);

      await items.update(1, { name: 'touched' });
      expect(readRows('prompt', 'prompt_items')).toContainEqual(clash);
    });

    it('skips a row whose id is not a positive whole number', async () => {
      plant(
        'prompt',
        'prompt_items',
        JSON.stringify([good, { ...good, id: 0 }, { ...good, id: 1.5 }, { ...good, id: -3 }]),
      );

      expect(await new PromptItemCollection().all()).toHaveLength(1);
    });
  });

  describe('the migration record', () => {
    it('knows whether a migration has run for a project, or for the shared data', async () => {
      const project = join(home, 'project');
      mkdirSync(project);
      const migrations = new SystemMigrationCollection();
      await migrations.create({
        cwd: project,
        name: 'prompts-to-entities',
        sourceFile: '/old/prompts.json',
        promptCount: 3,
        categoryCount: 0,
        linkCount: 0,
        skippedCount: 0,
        ranAt: NOW,
      });

      expect(await migrations.hasRun('prompts-to-entities', project)).toBe(true);
      expect(await migrations.hasRun('prompts-to-entities', null)).toBe(false);
      expect(await migrations.hasRun('another', project)).toBe(false);
    });
  });
});
