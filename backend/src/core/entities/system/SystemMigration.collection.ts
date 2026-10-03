import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultSequences } from '../defaultSequences';
import { SystemMigration } from './SystemMigration.entity';

export class SystemMigrationCollection extends AbstractEntityCollection<SystemMigration> {
  readonly domain = 'system';
  readonly table = 'system_migrations';
  protected readonly columns = SystemMigration.COLUMNS;

  constructor() {
    super(defaultSequences());
  }

  protected hydrate(row: RawRow): SystemMigration {
    return SystemMigration.fromRow(row);
  }

  /** Whether [name] has already been run for [cwd] (null for the shared data). */
  async hasRun(name: string, cwd: string | null): Promise<boolean> {
    return (await this.where((migration) => migration.name === name && migration.belongsTo(cwd)))
      .length > 0;
  }
}
