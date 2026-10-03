import { join } from 'path';
import { readJsonArrayForUpdate, updateJsonArrayFile } from '../features/atomic-json';
import { AbstractEntity, parseRow, type Columns, type EntityRow } from './AbstractEntity';
import { entitiesRoot } from './entityPaths';
import { normalizeCwd } from './normalizeCwd';

/**
 * Hands out the next whole number for a table.
 *
 * Behind an interface so the collections that need numbers do not depend on the
 * collection that stores them: the sequence table is itself a collection.
 */
export interface SequenceSource {
  /**
   * The next number for [table], greater than every number handed out before and
   * greater than [floor], the highest id already in the table. The floor is what
   * keeps a table someone filled by hand from being given an id that is taken.
   *
   * With a [count] above one it hands out a block at once and answers the LAST
   * number of it: the block is `answer - count + 1` up to `answer`.
   */
  next(table: string, floor: number, count?: number): Promise<number>;
}

/**
 * An entity file exists but cannot be read.
 *
 * Reading refuses rather than answering "empty": an empty list would look like
 * every row was lost, and the next write would then replace the file with it.
 */
export class EntityFileUnreadableError extends Error {
  constructor(
    readonly filePath: string,
    readonly reason: string,
  ) {
    super(`entity file ${filePath} could not be read (${reason})`);
    this.name = 'EntityFileUnreadableError';
  }
}

/** What a change to the rows of a table answers: the rows to keep and a value to return. */
export interface RowChange<Row extends EntityRow, T> {
  rows: Row[];
  result: T;
}

/**
 * All the rows of one table: its file, and everything that acts on many rows.
 *
 * One collection class per entity class (`PromptItem` and `PromptItemCollection`),
 * and one file per collection, found by the table's domain and name. An instance
 * of the entity class is one row; this is the set, which is why reading all rows,
 * finding by id and creating a row are here and not on the entity.
 *
 * Nothing is cached. Several backends can share the file, so each call reads it
 * afresh and each change is one read-modify-write on the atomic path.
 */
export abstract class AbstractEntityCollection<E extends AbstractEntity<Row>, Row extends EntityRow> {
  /** Folder under the entities root, singular snake_case: `prompt`. */
  abstract readonly domain: string;
  /** Table name, plural snake_case with the domain as its prefix: `prompt_items`. */
  abstract readonly table: string;
  /** What a row of this table must look like. */
  protected abstract readonly columns: Columns;
  /** Build the entity for one row that has passed the column check. */
  protected abstract hydrate(row: Row): E;

  protected constructor(private readonly sequences: SequenceSource | null) {}

  /** `~/.claude-code-gui/entities/<domain>/<table>.entity.json`. */
  get filePath(): string {
    return join(entitiesRoot(), this.domain, `${this.table}.entity.json`);
  }

  /** Every row, as entities. Throws {@link EntityFileUnreadableError} if the file is unreadable. */
  async all(): Promise<E[]> {
    const { rows } = await this.readRows();
    return rows.map((row) => this.hydrate(row));
  }

  async find(id: number): Promise<E | null> {
    const { rows } = await this.readRows();
    const row = rows.find((candidate) => candidate.id === id);
    return row ? this.hydrate(row) : null;
  }

  async where(predicate: (entity: E) => boolean): Promise<E[]> {
    return (await this.all()).filter(predicate);
  }

  /**
   * Add a row, giving it the next id.
   *
   * The number comes from the sequence BEFORE the row is written, so a failure
   * between the two costs a number that is never used, never a number used twice.
   * `cwd` is normalized here so no caller has to remember to.
   */
  async create(attributes: Omit<Row, 'id'>): Promise<E> {
    const id = await this.allocateId();
    const cwd = attributes.cwd === null ? null : normalizeCwd(attributes.cwd);
    const row = { ...attributes, id, cwd } as unknown as Row;

    await this.mutate((rows) => ({ rows: [...rows, row], result: undefined }));
    return this.hydrate(row);
  }

  /**
   * Add every candidate that is not already a row, in one write, answering the
   * rows that were added.
   *
   * [isSame] says whether a stored row already stands for a candidate. The check
   * runs INSIDE the write, so several processes moving the same data at once add
   * each row once. The numbers are taken before the write, so a candidate that
   * turns out to be there already costs a number that is never used.
   */
  async createMissing(
    candidates: Array<Omit<Row, 'id'>>,
    isSame: (stored: Row, candidate: Omit<Row, 'id'>) => boolean,
  ): Promise<E[]> {
    if (candidates.length === 0) return [];
    const ids = await this.allocateIds(candidates.length);
    const normalized = candidates.map((candidate) => ({
      ...candidate,
      cwd: candidate.cwd === null ? null : normalizeCwd(candidate.cwd),
    }));

    const added = await this.mutate<Row[]>((rows) => {
      const stored = [...rows];
      const fresh: Row[] = [];
      normalized.forEach((candidate, index) => {
        if (stored.some((row) => isSame(row, candidate))) return;
        const row = { ...candidate, id: ids[index] } as unknown as Row;
        stored.push(row);
        fresh.push(row);
      });
      return fresh.length === 0 ? { rows, result: [] } : { rows: stored, result: fresh };
    });
    return added.map((row) => this.hydrate(row));
  }

  /** Change columns of one row, answering the new entity, or null if there is no such row. */
  async update(id: number, patch: Partial<Omit<Row, 'id'>>): Promise<E | null> {
    const normalized =
      patch.cwd === undefined || patch.cwd === null ? patch : { ...patch, cwd: normalizeCwd(patch.cwd) };

    const updated = await this.mutate<Row | null>((rows) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return { rows, result: null };
      const next = { ...rows[index], ...normalized, id } as Row;
      return { rows: rows.map((row, i) => (i === index ? next : row)), result: next };
    });
    return updated ? this.hydrate(updated) : null;
  }

  /** Remove one row, answering whether there was one. */
  async delete(id: number): Promise<boolean> {
    return this.mutate((rows) => {
      const kept = rows.filter((row) => row.id !== id);
      return kept.length === rows.length ? { rows, result: false } : { rows: kept, result: true };
    });
  }

  /**
   * Change the table's rows in one atomic read-modify-write, answering whatever
   * [change] says to answer.
   *
   * The lower level that `create`, `update` and `delete` are written on, and what
   * a change that touches many rows at once (moving a row to the top and pushing
   * the rest down) is written on too. Returning the SAME `rows` array it was given
   * means "nothing changed" and writes nothing.
   *
   * Rows that fail the column check are not loaded, but they are written back
   * unchanged at the end of the file. Reading must not quietly edit a store, and a
   * hand edit or a row from a newer version has to survive our next save.
   */
  async mutate<T>(change: (rows: Row[]) => RowChange<Row, T>): Promise<T> {
    let result: T | undefined;
    const outcome = await updateJsonArrayFile(this.filePath, (current) => {
      const { rows, rejected } = this.split(current);
      const changed = change(rows);
      result = changed.result;
      if (changed.rows === rows) return null;
      return [...changed.rows, ...rejected];
    });
    if (outcome.status === 'error') throw new Error(outcome.error);
    return result as T;
  }

  /** The next id for this table. */
  protected async allocateId(): Promise<number> {
    if (this.sequences === null) {
      throw new Error(`table ${this.table} has no sequence to take an id from`);
    }
    const { rows } = await this.readRows();
    const floor = rows.reduce((highest, row) => Math.max(highest, row.id), 0);
    return this.sequences.next(this.table, floor);
  }

  /** A block of [count] ids for this table, lowest first. */
  protected async allocateIds(count: number): Promise<number[]> {
    if (this.sequences === null) {
      throw new Error(`table ${this.table} has no sequence to take an id from`);
    }
    const { rows } = await this.readRows();
    const floor = rows.reduce((highest, row) => Math.max(highest, row.id), 0);
    const last = await this.sequences.next(this.table, floor, count);
    return Array.from({ length: count }, (_, index) => last - count + 1 + index);
  }

  private async readRows(): Promise<{ rows: Row[]; rejected: unknown[] }> {
    const read = await readJsonArrayForUpdate(this.filePath);
    if (read.status === 'unreadable') throw new EntityFileUnreadableError(this.filePath, read.reason);
    return this.split(read.data);
  }

  private split(raw: unknown[]): { rows: Row[]; rejected: unknown[] } {
    const rows: Row[] = [];
    const rejected: unknown[] = [];
    const seen = new Set<number>();
    for (const entry of raw) {
      const row = parseRow<Row>(entry, this.columns);
      // A second row with an id already taken is as unusable as a malformed one.
      if (row === null || seen.has(row.id)) {
        rejected.push(entry);
        continue;
      }
      seen.add(row.id);
      rows.push(row);
    }
    return { rows, rejected };
  }
}
