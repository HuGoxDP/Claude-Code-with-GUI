import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { ApiProvider } from './ApiProvider.entity';

export class ApiProviderCollection extends AbstractEntityCollection<ApiProvider> {
  readonly domain = 'provider';
  readonly table = 'api_providers';
  protected readonly columns = ApiProvider.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): ApiProvider {
    return ApiProvider.fromRow(row);
  }

  /** Every provider, by name as people read it (case and accents ignored, numbers in order). */
  async byName(): Promise<ApiProvider[]> {
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    return (await this.all()).sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id);
  }
}
