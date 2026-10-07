import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { SessionTemplate } from './SessionTemplate.entity';

export class SessionTemplateCollection extends AbstractEntityCollection<SessionTemplate> {
  readonly domain = 'session';
  readonly table = 'session_templates';
  protected readonly columns = SessionTemplate.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): SessionTemplate {
    return SessionTemplate.fromRow(row);
  }

  /** Every template, by name as people read it (case and accents ignored, numbers in order). */
  async byName(): Promise<SessionTemplate[]> {
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return (await this.all()).sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id);
  }
}
