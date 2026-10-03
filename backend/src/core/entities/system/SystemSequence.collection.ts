import { AbstractEntityCollection, EntityChange, SequenceSource } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { SystemSequence } from './SystemSequence.entity';

/**
 * Every table's counter, and the one place ids come from.
 *
 * It is a collection like any other, so its own rows are numbered too. It does
 * not number them from itself, which would need a sequence for the sequence: it
 * never deletes a row, so its own ids are simply one more than the highest.
 */
export class SystemSequenceCollection
  extends AbstractEntityCollection<SystemSequence>
  implements SequenceSource
{
  readonly domain = 'system';
  readonly table = 'system_sequences';
  protected readonly columns = SystemSequence.COLUMNS;

  constructor() {
    super(null);
  }

  protected hydrate(row: RawRow): SystemSequence {
    return SystemSequence.fromRow(row);
  }

  async next(table: string, floor: number, count = 1): Promise<number> {
    return this.mutate((sequences) => {
      const existing = sequences.find((sequence) => sequence.tableName === table);
      const lastId = Math.max(existing?.lastId ?? 0, floor) + count;

      if (existing) {
        existing.lastId = lastId;
        return EntityChange.write(sequences, lastId);
      }
      const id = sequences.reduce((highest, sequence) => Math.max(highest, sequence.id), 0) + 1;
      return EntityChange.write([...sequences, new SystemSequence(id, null, table, lastId)], lastId);
    });
  }
}
