import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { SessionFavorite } from './SessionFavorite.entity';

export class SessionFavoriteCollection extends AbstractEntityCollection<SessionFavorite> {
  readonly domain = 'session';
  readonly table = 'session_favorites';
  protected readonly columns = SessionFavorite.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): SessionFavorite {
    return SessionFavorite.fromRow(row);
  }

  /** Every star, newest first. Two stars of the same millisecond keep the order they were made in. */
  async newestFirst(): Promise<SessionFavorite[]> {
    return (await this.all()).sort((a, b) => b.favoritedAt - a.favoritedAt || b.id - a.id);
  }
}
