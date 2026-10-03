import { AbstractEntity, BASE_COLUMNS, type Columns, type EntityRow } from '../AbstractEntity';

export interface PromptCategoryItemLinkRow extends EntityRow {
  categoryId: number;
  itemId: number;
  /**
   * Place of the item inside the category. Smaller is higher; 1 is the top. An
   * item can sit in several categories, each with a place of its own.
   */
  priority: number;
}

/**
 * One item sitting in one category (`prompt_category_item_links`).
 *
 * The many-to-many join between categories and items, carrying the item's place
 * in that category. `cwd` is copied from the item when the link is made and
 * never changed on its own, so the links of one project can be found, and
 * removed with it, without opening the items.
 */
export class PromptCategoryItemLink extends AbstractEntity<PromptCategoryItemLinkRow> {
  static readonly columns: Columns = {
    ...BASE_COLUMNS,
    categoryId: 'int',
    itemId: 'int',
    priority: 'int',
  };

  categoryId: number;
  itemId: number;
  priority: number;

  constructor(row: PromptCategoryItemLinkRow) {
    super(row);
    this.categoryId = row.categoryId;
    this.itemId = row.itemId;
    this.priority = row.priority;
  }

  toRow(): PromptCategoryItemLinkRow {
    return {
      id: this.id,
      cwd: this.cwd,
      categoryId: this.categoryId,
      itemId: this.itemId,
      priority: this.priority,
    };
  }
}
