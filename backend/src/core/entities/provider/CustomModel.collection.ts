import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { CustomModel } from './CustomModel.entity';

export class CustomModelCollection extends AbstractEntityCollection<CustomModel> {
  readonly domain = 'provider';
  readonly table = 'custom_models';
  protected readonly columns = CustomModel.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): CustomModel {
    return CustomModel.fromRow(row);
  }

  /** Every custom model in the order they were added: the order the picker lists them. */
  async inOrder(): Promise<CustomModel[]> {
    return (await this.all()).sort((a, b) => a.id - b.id);
  }
}
