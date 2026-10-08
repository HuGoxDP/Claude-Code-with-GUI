import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * A named way of reaching Claude through another endpoint (`api_providers`),
 * ported from CC GUI's API provider manager: the address, which variable carries
 * the key, and the models to put in Claude Code's model slots.
 *
 * Using one writes those values into the documented variables of Claude Code's
 * own settings.json `env` block (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN or
 * ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_DEFAULT_*_MODEL), which is how a
 * terminal user configures the same thing. The key itself is not a column: this
 * table is append-only, so a key written here would stay in the file after it
 * was changed or deleted. It lives in api-provider-keys.json instead (mode 600),
 * by this row's id. A provider is the user's, not a project's (`projectId` null).
 */
export class ApiProvider extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](
    new Column('name', 'string'),
    new Column('baseUrl', 'nullable-string'),
    new Column('authVar', 'string'),
    new Column('model', 'nullable-string'),
    new Column('opusModel', 'nullable-string'),
    new Column('sonnetModel', 'nullable-string'),
    new Column('haikuModel', 'nullable-string'),
    new Column('fableModel', 'nullable-string'),
    new Column('updatedAt', 'number'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** What the user called it; unique among providers, compared as typed. */
    public name: string,
    /** ANTHROPIC_BASE_URL, or null to keep Claude Code's own endpoint. */
    public baseUrl: string | null,
    /** The variable the key goes in: `ANTHROPIC_AUTH_TOKEN` (sent as a bearer token) or `ANTHROPIC_API_KEY`. */
    public authVar: string,
    /** ANTHROPIC_MODEL: the model a session starts on; null leaves Claude Code's default. */
    public model: string | null,
    /** ANTHROPIC_DEFAULT_OPUS_MODEL. */
    public opusModel: string | null,
    /** ANTHROPIC_DEFAULT_SONNET_MODEL. */
    public sonnetModel: string | null,
    /** ANTHROPIC_DEFAULT_HAIKU_MODEL. */
    public haikuModel: string | null,
    /** ANTHROPIC_DEFAULT_FABLE_MODEL. */
    public fableModel: string | null,
    /** When it was last saved, in epoch milliseconds. */
    public updatedAt: number,
  ) {
    super(id, projectId);
  }

  /** A provider that has not been inserted yet, so it has no number. */
  static draft(fields: Omit<ApiProviderFields, never>, updatedAt: number): ApiProvider {
    return new ApiProvider(
      0,
      null,
      fields.name,
      fields.baseUrl,
      fields.authVar,
      fields.model,
      fields.opusModel,
      fields.sonnetModel,
      fields.haikuModel,
      fields.fableModel,
      updatedAt,
    );
  }

  static fromRow(row: RawRow): ApiProvider {
    return new ApiProvider(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('name'),
      row.nullableString('baseUrl'),
      row.string('authVar'),
      row.nullableString('model'),
      row.nullableString('opusModel'),
      row.nullableString('sonnetModel'),
      row.nullableString('haikuModel'),
      row.nullableString('fableModel'),
      row.number('updatedAt'),
    );
  }

  get columns(): readonly Column[] {
    return ApiProvider.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      baseUrl: this.baseUrl,
      authVar: this.authVar,
      model: this.model,
      opusModel: this.opusModel,
      sonnetModel: this.sonnetModel,
      haikuModel: this.haikuModel,
      fableModel: this.fableModel,
      updatedAt: this.updatedAt,
    };
  }
}

/** The values a provider is saved with, apart from its number and time. */
export interface ApiProviderFields {
  name: string;
  baseUrl: string | null;
  authVar: string;
  model: string | null;
  opusModel: string | null;
  sonnetModel: string | null;
  haikuModel: string | null;
  fableModel: string | null;
}
