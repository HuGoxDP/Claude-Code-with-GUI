import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * A title this app generated for a session (`session_ai_titles`).
 *
 * Kept here rather than in the transcript: the transcript is the CLI's, and the
 * app does not append to it. A session id is unique across projects, so a title
 * is found by `sessionId` alone; `projectId` is the project the session runs in,
 * which says whose title it is.
 */
export class SessionAiTitle extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('sessionId', 'string'),
    new Column('title', 'string'),
    new Column('createdAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The CLI's session id: the name of its transcript, without `.jsonl`. */
    public sessionId: string,
    /** The title as the session list shows it. */
    public title: string,
    /** When the title was stored, in epoch milliseconds. */
    public createdAt: number,
  ) {
    super(id, projectId);
  }

  /** A title that has not been inserted yet, so it has no number. */
  static draft(projectId: number | null, sessionId: string, title: string, createdAt: number): SessionAiTitle {
    return new SessionAiTitle(0, projectId, sessionId, title, createdAt);
  }

  static fromRow(row: RawRow): SessionAiTitle {
    return new SessionAiTitle(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('sessionId'),
      row.string('title'),
      row.number('createdAt'),
    );
  }

  get columns(): readonly Column[] {
    return SessionAiTitle.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      sessionId: this.sessionId,
      title: this.title,
      createdAt: this.createdAt,
    };
  }
}
