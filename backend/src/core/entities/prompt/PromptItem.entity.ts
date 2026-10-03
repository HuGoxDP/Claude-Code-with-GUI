import { AbstractEntity, BASE_COLUMNS, type Columns, type EntityRow } from '../AbstractEntity';

export interface PromptItemRow extends EntityRow {
  /**
   * Identity that survives leaving this machine. The numeric `id` means nothing
   * on another computer, so exported files name a prompt by this instead. A
   * prompt moved from the old store keeps its old id here.
   */
  uuid: string;
  name: string;
  content: string;
  /** Place in the library's own order. Smaller is higher; 1 is the top. */
  priority: number;
  /** Creation time in epoch milliseconds. */
  createdAt: number;
  /** Last edit time in epoch milliseconds. Equals `createdAt` until the first edit. */
  updatedAt: number;
}

/**
 * One saved prompt (`prompt_items`).
 *
 * A row with a `cwd` is a project prompt and shows only in that project; a row
 * with none is shared by every project. Which categories it sits in, and where in
 * each, is not stored here but in the links (`prompt_category_item_links`).
 */
export class PromptItem extends AbstractEntity<PromptItemRow> {
  static readonly columns: Columns = {
    ...BASE_COLUMNS,
    uuid: 'string',
    name: 'string',
    content: 'string',
    priority: 'int',
    createdAt: 'number',
    updatedAt: 'number',
  };

  uuid: string;
  name: string;
  content: string;
  priority: number;
  createdAt: number;
  updatedAt: number;

  constructor(row: PromptItemRow) {
    super(row);
    this.uuid = row.uuid;
    this.name = row.name;
    this.content = row.content;
    this.priority = row.priority;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
  }

  toRow(): PromptItemRow {
    return {
      id: this.id,
      cwd: this.cwd,
      uuid: this.uuid,
      name: this.name,
      content: this.content,
      priority: this.priority,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
