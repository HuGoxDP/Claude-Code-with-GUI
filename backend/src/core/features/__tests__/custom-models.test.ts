import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { customModelPrices, deleteCustomModel, readCustomModels, saveCustomModel } from '../custom-models';
import { Column, RawRow } from '../../entities/Column';

// Real files: the entity table under a throwaway CCG_HOME.
describe('custom-models', () => {
  const original = process.env.CCG_HOME;
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-custom-models-')));
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = original;
    rmSync(root, { recursive: true, force: true });
  });

  it('adds models in order, with the optional fields empty as null and prices as numbers', async () => {
    await saveCustomModel({ model: ' gw-large ', label: 'Gateway large', description: '', inputPrice: '3', outputPrice: 15 });
    const result = await saveCustomModel({ model: 'local-coder' });
    expect(result.ok).toBe(true);
    expect(result.models.map((m) => [m.model, m.label, m.description, m.inputPrice, m.outputPrice, m.cacheReadPrice])).toEqual([
      ['gw-large', 'Gateway large', null, 3, 15, null],
      ['local-coder', null, null, null, null, null],
    ]);
    expect(result.models[0]).not.toHaveProperty('projectId');
  });

  it('refuses a missing or two-word name, a repeated name and a price that is not one', async () => {
    await saveCustomModel({ model: 'gw-large' });
    for (const input of [{ model: '' }, { model: 'two words' }, { model: 'gw-large' }, { model: 'x', inputPrice: -1 }, { model: 'x', outputPrice: 'cheap' }]) {
      const result = await saveCustomModel(input);
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.models).toHaveLength(1);
    }
  });

  it('changes a model in place and takes one out', async () => {
    const { models } = await saveCustomModel({ model: 'gw-large' });
    const changed = await saveCustomModel({ id: models[0].id, model: 'gw-large', label: 'Large', cacheReadPrice: 0.3 });
    expect(changed.models).toHaveLength(1);
    expect(changed.models[0]).toMatchObject({ id: models[0].id, label: 'Large', cacheReadPrice: 0.3 });
    expect((await saveCustomModel({ id: 999, model: 'other' })).ok).toBe(false);

    expect((await deleteCustomModel(models[0].id)).models).toEqual([]);
    expect((await readCustomModels()).models).toEqual([]);
  });

  it('hands the usage history the prices of the models that have any', async () => {
    await saveCustomModel({ model: 'gw-large', inputPrice: 3, outputPrice: 15 });
    await saveCustomModel({ model: 'no-price' });
    const prices = await customModelPrices();
    expect([...prices.keys()]).toEqual(['gw-large']);
    expect(prices.get('gw-large')).toEqual({ input: 3, output: 15, cacheWrite: null, cacheRead: null });
  });
});

describe('nullable-number column', () => {
  const columns = [new Column('id', 'int'), new Column('price', 'nullable-number')];
  it('takes a number or null, and nothing else', () => {
    expect(RawRow.parse({ id: 1, price: 2.5 }, columns)?.nullableNumber('price')).toBe(2.5);
    expect(RawRow.parse({ id: 1, price: null }, columns)?.nullableNumber('price')).toBeNull();
    expect(RawRow.parse({ id: 1, price: '2.5' }, columns)).toBeNull();
    expect(RawRow.parse({ id: 1, price: Infinity }, columns)).toBeNull();
  });
});
