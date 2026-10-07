import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * A named set of the choices a new conversation starts with: the model, the
 * permission mode and the effort (`session_templates`). Ported from CC GUI's
 * session templates.
 *
 * They are the flags a terminal user would put in a shell alias
 * (`claude --model … --permission-mode …`, with the effort setting), saved under
 * a name and applied in one step. The mode is kept in the composer's own words
 * (inputMode), as everywhere else in this app. A template is shared by every project
 * (`projectId` is null), as in CC GUI. A column the template does not set is
 * null, and applying it leaves that choice as it is.
 */
export class SessionTemplate extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('name', 'string'),
    new Column('model', 'nullable-string'),
    new Column('inputMode', 'nullable-string'),
    new Column('effort', 'nullable-string'),
    new Column('updatedAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** What the user called it; unique among templates, compared as typed. */
    public name: string,
    /** The model id or alias, as the model picker holds it. */
    public model: string | null,
    /** The composer's mode (`ask_before_edit`, `auto_edit`, `plan`, `auto`, `bypass`), which the chat turns into the CLI's permission mode. */
    public inputMode: string | null,
    /** The effort level as the CLI's `effortLevel` setting spells it, or `ultracode`. */
    public effort: string | null,
    /** When it was last saved, in epoch milliseconds. */
    public updatedAt: number,
  ) {
    super(id, projectId);
  }

  /** A template that has not been inserted yet, so it has no number. */
  static draft(
    name: string,
    model: string | null,
    inputMode: string | null,
    effort: string | null,
    updatedAt: number,
  ): SessionTemplate {
    return new SessionTemplate(0, null, name, model, inputMode, effort, updatedAt);
  }

  static fromRow(row: RawRow): SessionTemplate {
    return new SessionTemplate(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('name'),
      row.nullableString('model'),
      row.nullableString('inputMode'),
      row.nullableString('effort'),
      row.number('updatedAt'),
    );
  }

  get columns(): readonly Column[] {
    return SessionTemplate.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      model: this.model,
      inputMode: this.inputMode,
      effort: this.effort,
      updatedAt: this.updatedAt,
    };
  }
}
