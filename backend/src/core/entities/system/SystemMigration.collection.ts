import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { defaultSequences } from '../defaultSequences';
import { SystemMigration, type SystemMigrationRow } from './SystemMigration.entity';

export class SystemMigrationCollection extends AbstractEntityCollection<
  SystemMigration,
  SystemMigrationRow
> {
  readonly domain = 'system';
  readonly table = 'system_migrations';
  protected readonly columns = SystemMigration.columns;

  constructor() {
    super(defaultSequences());
  }

  protected hydrate(row: SystemMigrationRow): SystemMigration {
    return new SystemMigration(row);
  }

  /** Whether [name] has already been run for [cwd] (null for the shared data). */
  async hasRun(name: string, cwd: string | null): Promise<boolean> {
    return (await this.where((migration) => migration.name === name && migration.belongsTo(cwd)))
      .length > 0;
  }
}
