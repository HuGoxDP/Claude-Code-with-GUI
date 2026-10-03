import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultSequences } from '../defaultSequences';
import { normalizeCwd } from '../normalizeCwd';
import { PromptItem } from './PromptItem.entity';

export class PromptItemCollection extends AbstractEntityCollection<PromptItem> {
  readonly domain = 'prompt';
  readonly table = 'prompt_items';
  protected readonly columns = PromptItem.COLUMNS;

  constructor() {
    super(defaultSequences());
  }

  protected hydrate(row: RawRow): PromptItem {
    return PromptItem.fromRow(row);
  }

  /**
   * The prompts of one project, or the shared ones when [cwd] is null, in the
   * library's own order.
   */
  async inScope(cwd: string | null): Promise<PromptItem[]> {
    const wanted = cwd === null ? null : normalizeCwd(cwd);
    return (await this.where((item) => item.belongsTo(wanted))).sort(
      (a, b) => a.priority - b.priority,
    );
  }
}
