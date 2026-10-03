import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { defaultSequences } from '../defaultSequences';
import { PromptCategory, type PromptCategoryRow } from './PromptCategory.entity';

export class PromptCategoryCollection extends AbstractEntityCollection<
  PromptCategory,
  PromptCategoryRow
> {
  readonly domain = 'prompt';
  readonly table = 'prompt_categories';
  protected readonly columns = PromptCategory.columns;

  constructor() {
    super(defaultSequences());
  }

  protected hydrate(row: PromptCategoryRow): PromptCategory {
    return new PromptCategory(row);
  }

  /** Every category in the order of the category column. */
  async inColumnOrder(): Promise<PromptCategory[]> {
    return (await this.all()).sort((a, b) => a.priority - b.priority);
  }
}
