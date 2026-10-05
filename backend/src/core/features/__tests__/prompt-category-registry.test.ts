import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createCategory,
  renameCategory,
  deleteCategory,
  reorderCategories,
  listCategories,
  resolveCategoryIdsByName,
} from '../prompt-category-registry';

describe('prompt category registry', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = mkdtempSync(join(tmpdir(), 'ccg-categories-'));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  const names = async () => (await listCategories()).map((category) => category.name);
  const idOf = async (name: string) =>
    (await listCategories()).find((category) => category.name === name)?.id as string;

  it('starts empty', async () => {
    expect(await listCategories()).toEqual([]);
  });

  it('adds a category at the bottom of the column, under its uuid', async () => {
    await createCategory('first');
    await createCategory('second');
    expect(await names()).toEqual(['first', 'second']);
    expect(await idOf('first')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a name that is already taken, whatever its case', async () => {
    await createCategory('Debug');
    expect(await createCategory('debug')).toEqual({ status: 'error', error: 'Category already exists' });
    expect(await names()).toEqual(['Debug']);
  });

  it('refuses an empty name', async () => {
    expect((await createCategory('   ')).status).toBe('error');
  });

  it('renames by uuid and refuses a clash', async () => {
    await createCategory('a');
    await createCategory('b');
    const a = await idOf('a');
    expect((await renameCategory(a, 'c')).status).toBe('ok');
    expect(await names()).toEqual(['c', 'b']);
    expect(await renameCategory(a, 'b')).toEqual({ status: 'error', error: 'Category already exists' });
    expect((await renameCategory('nope', 'x')).status).toBe('error');
  });

  it('deletes by uuid', async () => {
    await createCategory('a');
    await createCategory('b');
    await deleteCategory(await idOf('a'));
    expect(await names()).toEqual(['b']);
  });

  describe('reorderCategories()', () => {
    it('stores the column order and reads it back', async () => {
      for (const name of ['a', 'b', 'c']) await createCategory(name);
      const result = await reorderCategories([await idOf('c'), await idOf('a'), await idOf('b')]);
      expect(result.status === 'ok' && result.categories.map((c) => c.name)).toEqual(['c', 'a', 'b']);
      expect(await names()).toEqual(['c', 'a', 'b']);
    });

    it('keeps the categories the order leaves out below the named ones', async () => {
      for (const name of ['a', 'b', 'c']) await createCategory(name);
      await reorderCategories([await idOf('c')]);
      expect(await names()).toEqual(['c', 'a', 'b']);
    });

    it('ignores an id that is not a category', async () => {
      for (const name of ['a', 'b']) await createCategory(name);
      await reorderCategories(['nope', await idOf('b'), await idOf('a')]);
      expect(await names()).toEqual(['b', 'a']);
    });

    it('puts a category made later at the bottom of the new order', async () => {
      for (const name of ['a', 'b']) await createCategory(name);
      await reorderCategories([await idOf('b'), await idOf('a')]);
      await createCategory('c');
      expect(await names()).toEqual(['b', 'a', 'c']);
    });
  });

  describe('the "All" row in the column', () => {
    const ALL = '__all__';
    const priorities = async () =>
      Object.fromEntries((await listCategories()).map((c) => [c.name, c.priority]));

    it('is fixed at 0, with the categories above it negative and below it positive', async () => {
      for (const name of ['a', 'b', 'c', 'd']) await createCategory(name);
      const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map(idOf));

      await reorderCategories([a, b, ALL, c, d]);

      expect(await priorities()).toEqual({ a: -2, b: -1, c: 1, d: 2 });
      expect(await names()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('can sit at the very bottom', async () => {
      for (const name of ['a', 'b']) await createCategory(name);

      await reorderCategories([await idOf('a'), await idOf('b'), ALL]);

      expect(await priorities()).toEqual({ a: -2, b: -1 });
    });

    it('can sit at the very top, which is where it starts', async () => {
      for (const name of ['a', 'b']) await createCategory(name);

      await reorderCategories([ALL, await idOf('b'), await idOf('a')]);

      expect(await priorities()).toEqual({ b: 1, a: 2 });
    });

    it('stays on top when the order does not name it', async () => {
      for (const name of ['a', 'b']) await createCategory(name);
      await reorderCategories([await idOf('a'), await idOf('b'), ALL]);

      await reorderCategories([await idOf('b'), await idOf('a')]);

      expect(await priorities()).toEqual({ b: 1, a: 2 });
    });

    it('puts a category made later below it, however the column was arranged', async () => {
      for (const name of ['a', 'b']) await createCategory(name);
      await reorderCategories([await idOf('a'), await idOf('b'), ALL]);

      await createCategory('c');

      expect(await priorities()).toEqual({ a: -2, b: -1, c: 1 });
      expect(await names()).toEqual(['a', 'b', 'c']);
    });

    it('keeps categories the order leaves out below the named ones', async () => {
      for (const name of ['a', 'b', 'c']) await createCategory(name);

      await reorderCategories([await idOf('c'), ALL]);

      expect(await priorities()).toEqual({ c: -1, a: 1, b: 2 });
    });

    it('is named once even if the order repeats it', async () => {
      for (const name of ['a', 'b']) await createCategory(name);

      await reorderCategories([await idOf('a'), ALL, ALL, await idOf('b')]);

      expect(await priorities()).toEqual({ a: -1, b: 1 });
    });
  });

  describe('resolveCategoryIdsByName()', () => {
    it('matches an existing name and creates a missing one', async () => {
      await createCategory('Review');
      const byName = await resolveCategoryIdsByName(['review', 'New']);
      expect(byName.get('review')).toBe(await idOf('Review'));
      expect(byName.get('New')).toBe(await idOf('New'));
      expect(await names()).toEqual(['Review', 'New']);
    });
  });
});
