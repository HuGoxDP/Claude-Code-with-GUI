import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readJsonArrayForUpdate, updateJsonArrayFile } from '../atomic-json';

// The object-rooted functions refuse a file they cannot read, because replacing
// it would lose what the user had (issue #386). Entity files are arrays, so the
// same rule has to hold for them.

describe('atomic-json (array-rooted files)', () => {
  let dir: string;
  const file = () => join(dir, 'rows.entity.json');
  const write = (content: string) => writeFileSync(file(), content, 'utf-8');
  const read = () => readFileSync(file(), 'utf-8');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomic-json-array-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('readJsonArrayForUpdate()', () => {
    it('reads an absent file as an empty array, not as a failure', async () => {
      expect(await readJsonArrayForUpdate(file())).toEqual({ status: 'ok', data: [] });
    });

    it('reads an empty file as an empty array', async () => {
      write('  \n');
      expect(await readJsonArrayForUpdate(file())).toEqual({ status: 'ok', data: [] });
    });

    it('reads a JSON array', async () => {
      write('[{"id":1},{"id":2}]');
      expect(await readJsonArrayForUpdate(file())).toEqual({
        status: 'ok',
        data: [{ id: 1 }, { id: 2 }],
      });
    });

    it('reports a file that does not parse as unreadable', async () => {
      write('[{"id":1}{"id":2}]'); // what a torn write leaves behind
      expect((await readJsonArrayForUpdate(file())).status).toBe('unreadable');
    });

    // An object parses, and a row cannot be added to one.
    it('reports valid JSON that is not an array as unreadable', async () => {
      for (const content of ['{"id":1}', 'null', '"text"', '42']) {
        write(content);
        expect((await readJsonArrayForUpdate(file())).status).toBe('unreadable');
      }
    });
  });

  describe('updateJsonArrayFile()', () => {
    it('creates the file, with its folder, when it does not exist yet', async () => {
      const nested = join(dir, 'prompt', 'prompt_items.entity.json');

      const result = await updateJsonArrayFile(nested, (rows) => [...rows, { id: 1 }]);

      expect(result).toEqual({ status: 'ok' });
      expect(JSON.parse(readFileSync(nested, 'utf-8'))).toEqual([{ id: 1 }]);
    });

    it('applies the change to what is already there', async () => {
      write('[{"id":1}]');

      await updateJsonArrayFile(file(), (rows) => [...rows, { id: 2 }]);

      expect(JSON.parse(read())).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('writes nothing when the change answers null', async () => {
      write('[{"id":1}]');
      const before = read();

      const result = await updateJsonArrayFile(file(), () => null);

      expect(result).toEqual({ status: 'ok' });
      expect(read()).toBe(before);
    });

    it('refuses to replace a file it could not read, and leaves it as it was', async () => {
      const torn = '[{"id":1}{"id":2}]';
      write(torn);

      const result = await updateJsonArrayFile(file(), (rows) => [...rows, { id: 3 }]);

      expect(result.status).toBe('error');
      expect(read()).toBe(torn);
    });

    it('refuses to replace an object-rooted file', async () => {
      write('{"prompts":[1,2,3]}');

      const result = await updateJsonArrayFile(file(), () => [{ id: 1 }]);

      expect(result.status).toBe('error');
      expect(read()).toBe('{"prompts":[1,2,3]}');
    });

    it('reports a change that throws, and leaves the file as it was', async () => {
      write('[{"id":1}]');

      const result = await updateJsonArrayFile(file(), () => {
        throw new Error('boom');
      });

      expect(result).toEqual({ status: 'error', error: 'boom' });
      expect(JSON.parse(read())).toEqual([{ id: 1 }]);
    });

    // Two read-modify-write cycles overlapping would read the same starting
    // content, and the second write would drop the first one's row.
    it('runs overlapping updates one after another, so none is lost', async () => {
      write('[]');

      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          updateJsonArrayFile(file(), (rows) => [...rows, { id: i + 1 }]),
        ),
      );

      expect(JSON.parse(read())).toHaveLength(20);
    });
  });
});
