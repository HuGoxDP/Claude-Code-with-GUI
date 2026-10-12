import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * A model the user added to the model picker (`custom_models`), ported from CC
 * GUI's custom models: any model name Claude Code accepts, as `claude --model
 * <name>` or `/model <name>` does in the terminal, shown first in the picker.
 *
 * The prices are for models Claude Code cannot price itself (a model behind
 * another endpoint): the usage history adds them only where Claude Code recorded
 * tokens but no cost. US dollars per million tokens; null when not given. A
 * custom model is the user's, not a project's (`projectId` null).
 */
export class CustomModel extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('model', 'string'),
    new Column('label', 'nullable-string'),
    new Column('description', 'nullable-string'),
    new Column('inputPrice', 'nullable-number'),
    new Column('outputPrice', 'nullable-number'),
    new Column('cacheWritePrice', 'nullable-number'),
    new Column('cacheReadPrice', 'nullable-number'),
    new Column('updatedAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The name handed to Claude Code, exactly as typed; unique among custom models. */
    public model: string,
    /** What the picker calls it; null shows the model name. */
    public label: string | null,
    /** The line under it in the picker. */
    public description: string | null,
    /** Per million input tokens. */
    public inputPrice: number | null,
    /** Per million output tokens. */
    public outputPrice: number | null,
    /** Per million tokens written to the prompt cache. */
    public cacheWritePrice: number | null,
    /** Per million tokens read from the prompt cache. */
    public cacheReadPrice: number | null,
    /** When it was last saved, in epoch milliseconds. */
    public updatedAt: number,
  ) {
    super(id, projectId);
  }

  /** A custom model that has not been inserted yet, so it has no number. */
  static draft(fields: CustomModelFields, updatedAt: number): CustomModel {
    return new CustomModel(
      0,
      null,
      fields.model,
      fields.label,
      fields.description,
      fields.inputPrice,
      fields.outputPrice,
      fields.cacheWritePrice,
      fields.cacheReadPrice,
      updatedAt,
    );
  }

  static fromRow(row: RawRow): CustomModel {
    return new CustomModel(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('model'),
      row.nullableString('label'),
      row.nullableString('description'),
      row.nullableNumber('inputPrice'),
      row.nullableNumber('outputPrice'),
      row.nullableNumber('cacheWritePrice'),
      row.nullableNumber('cacheReadPrice'),
      row.number('updatedAt'),
    );
  }

  get columns(): readonly Column[] {
    return CustomModel.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      model: this.model,
      label: this.label,
      description: this.description,
      inputPrice: this.inputPrice,
      outputPrice: this.outputPrice,
      cacheWritePrice: this.cacheWritePrice,
      cacheReadPrice: this.cacheReadPrice,
      updatedAt: this.updatedAt,
    };
  }
}

/** The values a custom model is saved with, apart from its number and time. */
export interface CustomModelFields {
  model: string;
  label: string | null;
  description: string | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheWritePrice: number | null;
  cacheReadPrice: number | null;
}
