import { AbstractEntity, BASE_COLUMNS, type Columns, type EntityRow } from '../AbstractEntity';

export interface SystemMigrationRow extends EntityRow {
  /** What was moved, e.g. `prompts-to-entities`. */
  name: string;
  /** The file the rows were read from. It is left exactly as it was. */
  sourceFile: string;
  promptCount: number;
  categoryCount: number;
  linkCount: number;
  /** Rows in the source that could not be read, or pointed at nothing. */
  skippedCount: number;
  /** When it finished, in epoch milliseconds. */
  ranAt: number;
}

/**
 * The record that a piece of old data has been moved (`system_migrations`).
 *
 * Written LAST, after the rows it describes. A move that is interrupted leaves no
 * record and so is run again, and one that finished is never run a second time,
 * which is what stops rows the user has since deleted from coming back.
 */
export class SystemMigration extends AbstractEntity<SystemMigrationRow> {
  static readonly columns: Columns = {
    ...BASE_COLUMNS,
    name: 'string',
    sourceFile: 'string',
    promptCount: 'int',
    categoryCount: 'int',
    linkCount: 'int',
    skippedCount: 'int',
    ranAt: 'number',
  };

  name: string;
  sourceFile: string;
  promptCount: number;
  categoryCount: number;
  linkCount: number;
  skippedCount: number;
  ranAt: number;

  constructor(row: SystemMigrationRow) {
    super(row);
    this.name = row.name;
    this.sourceFile = row.sourceFile;
    this.promptCount = row.promptCount;
    this.categoryCount = row.categoryCount;
    this.linkCount = row.linkCount;
    this.skippedCount = row.skippedCount;
    this.ranAt = row.ranAt;
  }

  toRow(): SystemMigrationRow {
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
