/**
 * What a column can hold. Row files are plain JSON, so these four are all there
 * is: a whole number, any finite number (timestamps), a string, and a string that
 * may be absent.
 */
export type ColumnType = 'int' | 'number' | 'string' | 'nullable-string';

/** A table's columns by name. The schema a row is checked against on every read. */
export type Columns = Readonly<Record<string, ColumnType>>;

/** What every row has, whatever table it is in. */
export interface EntityRow {
  /** Whole number from 1, handed out by the sequence and never reused. */
  id: number;
  /**
   * The project directory this row belongs to, normalized, or null for a row
   * that belongs to no project and is shared by all of them.
   */
  cwd: string | null;
}

/** The columns every entity has. A concrete entity spreads these into its own. */
export const BASE_COLUMNS: Columns = {
  id: 'int',
  cwd: 'nullable-string',
};

function holds(type: ColumnType, value: unknown): boolean {
  switch (type) {
    case 'int':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'nullable-string':
      return value === null || typeof value === 'string';
  }
}

/**
 * Check one raw JSON value against a table's columns, answering the row or null.
 *
 * Strict about every column's type and the `id`, because a row that fails here is
 * not loaded and a half-understood row is worse than a skipped one. Lenient about
 * one thing: a missing `cwd` is read as null, since "no project" is what an
 * absent value would mean. Columns the schema does not name are dropped from the
 * answer; the collection keeps the original of any row it rejects, so rejecting
 * never loses data.
 */
export function parseRow<Row extends EntityRow>(raw: unknown, columns: Columns): Row | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;

  const row: Record<string, unknown> = {};
  for (const [name, type] of Object.entries(columns)) {
    const value = name === 'cwd' && candidate[name] === undefined ? null : candidate[name];
    if (!holds(type, value)) return null;
    row[name] = value;
  }
  if ((row.id as number) < 1) return null;
  return row as unknown as Row;
}

/**
 * One row of one table, as a program object.
 *
 * The file holds the row as JSON; the program works with it as an instance of a
 * class named after the table (`prompt_items` is `PromptItem`). What is shared by
 * every table lives here, and each concrete entity adds only its own columns, so
 * a table that needs something new does not touch the others.
 *
 * An instance stands for ONE row. Anything that acts on many rows at once belongs
 * to the matching collection class instead.
 */
export abstract class AbstractEntity<Row extends EntityRow = EntityRow> {
  readonly id: number;
  readonly cwd: string | null;

  protected constructor(row: Row) {
    this.id = row.id;
    this.cwd = row.cwd;
  }

  /** The row this entity is stored as. */
  abstract toRow(): Row;

  /** True for a row shared by every project. */
  get isGlobal(): boolean {
    return this.cwd === null;
  }

  /** Whether this row belongs to [cwd], which must already be normalized. */
  belongsTo(cwd: string | null): boolean {
    return this.cwd === cwd;
  }

  /** Lets `JSON.stringify(entity)` write the row rather than the object's fields. */
  toJSON(): Row {
    return this.toRow();
  }
}
