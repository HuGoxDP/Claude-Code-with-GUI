import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { SessionAiTitle } from './SessionAiTitle.entity';

export class SessionAiTitleCollection extends AbstractEntityCollection<SessionAiTitle> {
  readonly domain = 'session';
  readonly table = 'session_ai_titles';
  protected readonly columns = SessionAiTitle.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): SessionAiTitle {
    return SessionAiTitle.fromRow(row);
  }
}
