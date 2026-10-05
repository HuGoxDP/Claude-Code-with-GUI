import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * A session the user starred, so it stays at the top of the session list
 * (`session_favorites`).
 *
 * The session itself is the CLI's transcript under `~/.claude/projects`; this
 * row is only the user's decision about it. `projectId` is the project the
 * session runs in. The session list is paged, so a session starred months ago is
 * usually not in the page the webview holds, and the project is what lets its
 * row be built on its own. A star whose directory was never known (one moved
 * from the old file without one) has no project and is still shown as starred
 * wherever its session is listed.
 */
export class SessionFavorite extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('sessionId', 'string'),
    new Column('favoritedAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The CLI's session id: the name of its transcript, without `.jsonl`. */
    public sessionId: string,
    /** When it was starred, in epoch milliseconds. The list puts the newest first. */
    public favoritedAt: number,
  ) {
    super(id, projectId);
  }

  /** A star that has not been inserted yet, so it has no number. */
  static draft(projectId: number | null, sessionId: string, favoritedAt: number): SessionFavorite {
    return new SessionFavorite(0, projectId, sessionId, favoritedAt);
  }

  static fromRow(row: RawRow): SessionFavorite {
    return new SessionFavorite(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('sessionId'),
      row.number('favoritedAt'),
    );
  }

  get columns(): readonly Column[] {
    return SessionFavorite.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      sessionId: this.sessionId,
      favoritedAt: this.favoritedAt,
    };
  }
}
