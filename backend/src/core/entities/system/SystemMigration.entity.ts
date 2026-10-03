import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * The record that a piece of old data has been moved (`system_migrations`).
 *
 * Written LAST, after the rows it describes. A move that is interrupted leaves no
 * record and so is run again, and one that finished is never run a second time,
 * which is what stops rows the user has since deleted from coming back.
 */
export class SystemMigration extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('name', 'string'),
    new Column('sourceFile', 'string'),
    new Column('promptCount', 'int'),
    new Column('categoryCount', 'int'),
    new Column('linkCount', 'int'),
    new Column('skippedCount', 'int'),
    new Column('ranAt', 'number'),
  );

  constructor(
    id: number,
    cwd: string | null,
    /** What was moved, e.g. `prompts-to-entities`. */
    public name: string,
    /** The file the rows were read from. It is left exactly as it was. */
    public sourceFile: string,
    public promptCount: number,
    public categoryCount: number,
    public linkCount: number,
    /** Rows in the source that could not be read, or pointed at nothing. */
    public skippedCount: number,
    /** When it finished, in epoch milliseconds. */
    public ranAt: number,
  ) {
    super(id, cwd);
  }

  /** A record that has not been inserted yet, so it has no number. */
  static draft(
    cwd: string | null,
    name: string,
    sourceFile: string,
    promptCount: number,
    categoryCount: number,
    linkCount: number,
    skippedCount: number,
    ranAt: number,
  ): SystemMigration {
    return new SystemMigration(0, cwd, name, sourceFile, promptCount, categoryCount, linkCount, skippedCount, ranAt);
  }

  static fromRow(row: RawRow): SystemMigration {
    return new SystemMigration(
      row.int('id'),
      row.nullableString('cwd'),
      row.string('name'),
      row.string('sourceFile'),
      row.int('promptCount'),
      row.int('categoryCount'),
      row.int('linkCount'),
      row.int('skippedCount'),
      row.number('ranAt'),
    );
  }

  get columns(): readonly Column[] {
    return SystemMigration.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      cwd: this.cwd,
      name: this.name,
      sourceFile: this.sourceFile,
      promptCount: this.promptCount,
      categoryCount: this.categoryCount,
      linkCount: this.linkCount,
      skippedCount: this.skippedCount,
      ranAt: this.ranAt,
    };
  }
}
