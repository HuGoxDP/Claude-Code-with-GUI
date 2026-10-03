import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultSequences } from '../defaultSequences';
import { PromptCategoryItemLink } from './PromptCategoryItemLink.entity';

export class PromptCategoryItemLinkCollection extends AbstractEntityCollection<PromptCategoryItemLink> {
  readonly domain = 'prompt';
  readonly table = 'prompt_category_item_links';
  protected readonly columns = PromptCategoryItemLink.COLUMNS;

  constructor() {
    super(defaultSequences());
  }

  protected hydrate(row: RawRow): PromptCategoryItemLink {
    return PromptCategoryItemLink.fromRow(row);
  }

  /** The links into one category, in the order of that category. */
  async inCategory(categoryId: number): Promise<PromptCategoryItemLink[]> {
    return (await this.where((link) => link.categoryId === categoryId)).sort(
      (a, b) => a.priority - b.priority,
    );
  }

  /** The links out of one item: every category it sits in. */
  async ofItem(itemId: number): Promise<PromptCategoryItemLink[]> {
    return this.where((link) => link.itemId === itemId);
  }
}
