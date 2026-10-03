import { AbstractEntity, BASE_COLUMNS, type Columns, type EntityRow } from '../AbstractEntity';

export interface PromptCategoryRow extends EntityRow {
  /** Identity that survives leaving this machine; see {@link PromptItemRow.uuid}. */
  uuid: string;
  name: string;
  /** Place in the category column. Smaller is higher; 1 is the top. */
  priority: number;
  /** Creation time in epoch milliseconds. */
  createdAt: number;
}

/**
 * One category (`prompt_categories`).
 *
 * Categories belong to no project: one set is shared by the shared prompts and by
 * every project's, so `cwd` is always null here.
 */
export class PromptCategory extends AbstractEntity<PromptCategoryRow> {
  static readonly columns: Columns = {
    ...BASE_COLUMNS,
    uuid: 'string',
    name: 'string',
    priority: 'int',
    createdAt: 'number',
  };

  uuid: string;
  name: string;
  priority: number;
  createdAt: number;

  constructor(row: PromptCategoryRow) {
    super(row);
    this.uuid = row.uuid;
    this.name = row.name;
    this.priority = row.priority;
    this.createdAt = row.createdAt;
  }

  toRow(): PromptCategoryRow {
    return {
      id: this.id,
      cwd: this.cwd,
      uuid: this.uuid,
      name: this.name,
      priority: this.priority,
      createdAt: this.createdAt,
    };
  }
}
