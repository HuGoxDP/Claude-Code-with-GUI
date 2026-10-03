import { AbstractEntityCollection, type SequenceSource } from '../AbstractEntityCollection';
import { SystemSequence, type SystemSequenceRow } from './SystemSequence.entity';

/**
 * Every table's counter, and the one place ids come from.
 *
 * It is a collection like any other, so its own rows are numbered too. It does
 * not number them from itself, which would need a sequence for the sequence: it
 * never deletes a row, so its own ids are simply one more than the highest.
 */
export class SystemSequenceCollection
  extends AbstractEntityCollection<SystemSequence, SystemSequenceRow>
  implements SequenceSource
{
  readonly domain = 'system';
  readonly table = 'system_sequences';
  protected readonly columns = SystemSequence.columns;

  constructor() {
    super(null);
  }

  protected hydrate(row: SystemSequenceRow): SystemSequence {
    return new SystemSequence(row);
  }

  async next(table: string, floor: number): Promise<number> {
    return this.mutate((rows) => {
      const existing = rows.find((row) => row.tableName === table);
      const lastId = Math.max(existing?.lastId ?? 0, floor) + 1;

      if (existing) {
        return {
          rows: rows.map((row) => (row === existing ? { ...row, lastId } : row)),
          result: lastId,
        };
      }
      const id = rows.reduce((highest, row) => Math.max(highest, row.id), 0) + 1;
      return { rows: [...rows, { id, cwd: null, tableName: table, lastId }], result: lastId };
    });
  }
}
