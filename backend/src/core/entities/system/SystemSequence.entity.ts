import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * The counter behind one table's ids (`system_sequences`).
 *
 * Ids are never reused. "The highest id plus one" would give a deleted row's id
 * to the next row created, and anything still pointing at the deleted row (a link
 * in another project's file, say) would then silently point at a stranger. So the
 * highest id ever handed out is kept here, apart from the rows themselves.
 */
export class SystemSequence extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('tableName', 'string'),
    new Column('lastId', 'int'),
  );

  constructor(
    id: number,
    cwd: string | null,
    /** The table this counter numbers, e.g. `prompt_items`. */
    public tableName: string,
    /** The last id handed out for that table. Never goes down. */
    public lastId: number,
  ) {
    super(id, cwd);
  }

  static fromRow(row: RawRow): SystemSequence {
    return new SystemSequence(row.int('id'), row.nullableString('cwd'), row.string('tableName'), row.int('lastId'));
  }

  get columns(): readonly Column[] {
    return SystemSequence.COLUMNS;
  }

  toJSON() {
    return { id: this.id, cwd: this.cwd, tableName: this.tableName, lastId: this.lastId };
  }
}
