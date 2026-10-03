import { AbstractEntity, BASE_COLUMNS, type Columns, type EntityRow } from '../AbstractEntity';

export interface SystemSequenceRow extends EntityRow {
  /** The table this counter numbers, e.g. `prompt_items`. */
  tableName: string;
  /** The last id handed out for that table. Never goes down. */
  lastId: number;
}

/**
 * The counter behind one table's ids (`system_sequences`).
 *
 * Ids are never reused. "The highest id plus one" would give a deleted row's id
 * to the next row created, and anything still pointing at the deleted row (a link
 * in another project's file, say) would then silently point at a stranger. So the
 * highest id ever handed out is kept here, apart from the rows themselves.
 */
export class SystemSequence extends AbstractEntity<SystemSequenceRow> {
  static readonly columns: Columns = {
    ...BASE_COLUMNS,
    tableName: 'string',
    lastId: 'int',
  };

  tableName: string;
  lastId: number;

  constructor(row: SystemSequenceRow) {
    super(row);
    this.tableName = row.tableName;
    this.lastId = row.lastId;
  }

  toRow(): SystemSequenceRow {
    return { id: this.id, cwd: this.cwd, tableName: this.tableName, lastId: this.lastId };
  }
}
