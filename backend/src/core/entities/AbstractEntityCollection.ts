import { join } from 'path';
import { readJsonArrayForUpdate, updateJsonArrayFile } from '../features/atomic-json';
import { AbstractEntity } from './AbstractEntity';
import { Column, RawRow } from './Column';
import { entitiesRoot } from './entityPaths';

/**
 * Hands out the next whole number for a table.
 *
 * A class of its own so the collections that need numbers do not depend on the
 * collection that stores them: the sequence table is itself a collection.
 */
export abstract class SequenceSource {
  /**
   * The next number for [table], greater than every number handed out before and
   * greater than [floor], the highest id already in the table. The floor is what
   * keeps a table someone filled by hand from being given an id that is taken.
   *
   * With a [count] above one it hands out a block at once and answers the LAST
   * number of it: the block is `answer - count + 1` up to `answer`.
   */
  abstract next(table: string, floor: number, count?: number): Promise<number>;
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

/**
 * What a change to the rows of a table decides: which rows the table keeps and a
 * value to hand back to the caller.
 *
 * {@link EntityChange.keep} says nothing needs writing. {@link EntityChange.write}
 * says the file must be rewritten with the given rows, which are the entities the
 * change was given, edited in place or with some added or left out.
 */
export class EntityChange<E extends AbstractEntity, T> {
  private constructor(
    readonly entities: E[],
    readonly result: T,
    readonly needsWrite: boolean,
  ) {}

  static keep<E extends AbstractEntity, T>(entities: E[], result: T): EntityChange<E, T> {
    return new EntityChange(entities, result, false);
  }

  static write<E extends AbstractEntity, T>(entities: E[], result: T): EntityChange<E, T> {
    return new EntityChange(entities, result, true);
  }
}

/**
 * All the rows of one table: its file, and everything that acts on many rows.
 *
 * One collection class per entity class (`PromptItem` and `PromptItemCollection`),
 * and one file per collection, found by the table's domain and name. An instance
 * of the entity class is one row; this is the set, which is why reading all rows,
 * finding by id and inserting a row are here and not on the entity.
 *
 * Nothing is cached. Several backends can share the file, so each call reads it
 * afresh and each change is one read-modify-write on the atomic path.
 *
 * The JSON of the file is turned into entities on the way in and entities into
 * JSON on the way out, and never shows up in between.
 */
export abstract class AbstractEntityCollection<E extends AbstractEntity> {
  /** Folder under the entities root, singular snake_case: `prompt`. */
  abstract readonly domain: string;
  /** Table name, plural snake_case with the domain as its prefix: `prompt_items`. */
  abstract readonly table: string;
  /** What a row of this table must look like. */
  protected abstract readonly columns: readonly Column[];
  /** Build the entity for one row that has passed the column check. */
  protected abstract hydrate(row: RawRow): E;

  protected constructor(private readonly sequences: SequenceSource | null) {}

  /** `~/.claude-code-gui/entities/<domain>/<table>.entity.json`. */
  get filePath(): string {
    return join(entitiesRoot(), this.domain, `${this.table}.entity.json`);
  }

  /** Every row, as entities. Throws {@link EntityFileUnreadableError} if the file is unreadable. */
  async all(): Promise<E[]> {
    return (await this.readEntities()).entities;
  }

  async find(id: number): Promise<E | null> {
    return (await this.all()).find((candidate) => candidate.id === id) ?? null;
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
  async insert(entity: E): Promise<E> {
    entity.assignId(await this.allocateId());
    entity.normalizeOwnCwd();
    await this.mutate((entities) => EntityChange.write([...entities, entity], undefined));
    return entity;
  }

  /**
   * Add every candidate that no stored row stands for, in one write, answering the
   * rows that were added.
   *
   * [isSame] says whether a stored row already stands for a candidate. The check
   * runs INSIDE the write, so several processes moving the same data at once add
   * each row once. The numbers are taken before the write, so a candidate that
   * turns out to be there already costs a number that is never used.
   */
  async insertMissing(
    candidates: E[],
    isSame: (stored: E, candidate: E) => boolean,
  ): Promise<E[]> {
    if (candidates.length === 0) return [];
    const ids = await this.allocateIds(candidates.length);
    candidates.forEach((candidate, index) => {
      candidate.assignId(ids[index] as number);
      candidate.normalizeOwnCwd();
    });

    return this.mutate((entities) => {
      const stored = [...entities];
      const added: E[] = [];
      for (const candidate of candidates) {
        if (stored.some((row) => isSame(row, candidate))) continue;
        stored.push(candidate);
        added.push(candidate);
      }
      return added.length === 0 ? EntityChange.keep(entities, added) : EntityChange.write(stored, added);
    });
  }

  /**
   * Store the new state of an entity that was read from this table, answering
   * whether there was such a row. The row is found by its `id`.
   */
  async save(entity: E): Promise<boolean> {
    entity.normalizeOwnCwd();
    return this.mutate((entities) => {
      const index = entities.findIndex((row) => row.id === entity.id);
      if (index === -1) return EntityChange.keep(entities, false);
      return EntityChange.write(
        entities.map((row, i) => (i === index ? entity : row)),
        true,
      );
    });
  }

  /** Remove one row, answering whether there was one. */
  async delete(id: number): Promise<boolean> {
    return this.mutate((entities) => {
      const kept = entities.filter((row) => row.id !== id);
      return kept.length === entities.length
        ? EntityChange.keep(entities, false)
        : EntityChange.write(kept, true);
    });
  }

  /**
   * Change the table's rows in one atomic read-modify-write, answering whatever
   * [change] says to answer.
   *
   * The lower level that `insert`, `save` and `delete` are written on, and what a
   * change that touches many rows at once (moving a row to the top and pushing the
   * rest down) is written on too. [change] gets the entities and may edit them in
   * place; it must answer {@link EntityChange.write} for the edit to be stored.
   *
   * Rows that fail the column check are not loaded, but they are written back
   * unchanged at the end of the file. Reading must not quietly edit a store, and a
   * hand edit or a row from a newer version has to survive our next save.
   */
  async mutate<T>(change: (entities: E[]) => EntityChange<E, T>): Promise<T> {
    let result: T | undefined;
    const outcome = await updateJsonArrayFile(this.filePath, (current) => {
      const { entities, rejected } = this.split(current);
      const changed = change(entities);
      result = changed.result;
      if (!changed.needsWrite) return null;
      return [...changed.entities, ...rejected];
    });
    if (outcome.status === 'error') throw new Error(outcome.error);
    return result as T;
  }

  /** The next id for this table. */
  protected async allocateId(): Promise<number> {
    return (await this.allocateIds(1))[0] as number;
  }

  /** A block of [count] ids for this table, lowest first. */
  protected async allocateIds(count: number): Promise<number[]> {
    if (this.sequences === null) {
      throw new Error(`table ${this.table} has no sequence to take an id from`);
    }
    const { entities } = await this.readEntities();
    const floor = entities.reduce((highest, row) => Math.max(highest, row.id), 0);
    const last = await this.sequences.next(this.table, floor, count);
    return Array.from({ length: count }, (_, index) => last - count + 1 + index);
  }

  private async readEntities(): Promise<{ entities: E[]; rejected: unknown[] }> {
    const read = await readJsonArrayForUpdate(this.filePath);
    if (read.status === 'unreadable') throw new EntityFileUnreadableError(this.filePath, read.reason);
    return this.split(read.data);
  }

  /** The IO boundary: raw JSON values in, entities out; what fails the check is kept aside as it was. */
  private split(raw: unknown[]): { entities: E[]; rejected: unknown[] } {
    const entities: E[] = [];
    const rejected: unknown[] = [];
    const seen = new Set<number>();
    for (const entry of raw) {
      const row = RawRow.parse(entry, this.columns);
      const entity = row === null ? null : this.hydrate(row);
      // A second row with an id already taken is as unusable as a malformed one.
      if (entity === null || seen.has(entity.id)) {
        rejected.push(entry);
        continue;
      }
      seen.add(entity.id);
      entities.push(entity);
    }
    return { entities, rejected };
  }
}
