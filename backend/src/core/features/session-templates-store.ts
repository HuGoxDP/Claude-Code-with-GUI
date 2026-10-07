import { EntityChange } from '../entities/AbstractEntityCollection';
import { SessionTemplateCollection } from '../entities/session/SessionTemplate.collection';
import { SessionTemplate } from '../entities/session/SessionTemplate.entity';

/**
 * Session templates: named sets of the choices a new conversation starts with
 * (model, permission mode, effort), ported from CC GUI's "Save as Template" and
 * "Create from Template".
 *
 * Rows live in the `session_templates` entity table (see core/entities). A
 * template is the user's own preset, not anything of the CLI's, so it is stored
 * here; applying one only sets the choices the chat already offers.
 *
 * Everything this module hands out is the wire shape the webview reads
 * (`SavedSessionTemplate`); the row numbers never leave the backend. A template
 * is named by its name, which is unique.
 */

/** The longest name kept; a longer one is refused rather than cut. */
export const SESSION_TEMPLATE_NAME_MAX = 80;

/** The longest value a choice may have; a model id is the longest real one. */
const VALUE_MAX = 200;

/** One template, in the shape the webview receives. */
export class SavedSessionTemplate {
  constructor(
    readonly name: string,
    readonly model: string | null,
    readonly inputMode: string | null,
    readonly effort: string | null,
    readonly updatedAt: number,
  ) {}

  static of(row: SessionTemplate): SavedSessionTemplate {
    return new SavedSessionTemplate(row.name, row.model, row.inputMode, row.effort, row.updatedAt);
  }

  toJSON() {
    return {
      name: this.name,
      model: this.model,
      inputMode: this.inputMode,
      effort: this.effort,
      updatedAt: this.updatedAt,
    };
  }
}

export interface SessionTemplatesResult {
  ok: boolean;
  /** Why the change was refused, when it was refused for something the user can fix. */
  error?: string;
  templates: SavedSessionTemplate[];
}

/** The stored templates by name, or none when they cannot be read. */
export async function readSessionTemplates(): Promise<SavedSessionTemplate[]> {
  try {
    return (await new SessionTemplateCollection().byName()).map(SavedSessionTemplate.of);
  } catch (err) {
    console.error('[node-backend]', 'could not read the session templates:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** A choice as stored: a non-empty string of a sane length, or null for "leave it as it is". */
function choice(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > VALUE_MAX) return undefined;
  return value;
}

/**
 * Save a template under `name`, replacing the one of that name if there is one
 * (the webview asks before it overwrites, as CC GUI does).
 */
export async function saveSessionTemplate(input: {
  name?: unknown;
  model?: unknown;
  inputMode?: unknown;
  effort?: unknown;
}): Promise<SessionTemplatesResult> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'name is required', templates: await readSessionTemplates() };
  if (name.length > SESSION_TEMPLATE_NAME_MAX) {
    return { ok: false, error: `name is longer than ${SESSION_TEMPLATE_NAME_MAX} characters`, templates: await readSessionTemplates() };
  }
  const model = choice(input.model);
  const inputMode = choice(input.inputMode);
  const effort = choice(input.effort);
  if (model === undefined || inputMode === undefined || effort === undefined) {
    return { ok: false, error: 'model, inputMode and effort must be strings or null', templates: await readSessionTemplates() };
  }

  try {
    const templates = new SessionTemplateCollection();
    const now = Date.now();
    const replaced = await templates.mutate((rows) => {
      const row = rows.find((candidate) => candidate.name === name);
      if (!row) return EntityChange.keep(rows, false);
      row.model = model;
      row.inputMode = inputMode;
      row.effort = effort;
      row.updatedAt = now;
      return EntityChange.write(rows, true);
    });
    if (!replaced) {
      await templates.insertMissing(
        [SessionTemplate.draft(name, model, inputMode, effort, now)],
        (stored, candidate) => stored.name === candidate.name,
      );
    }
  } catch (err) {
    console.error('[node-backend]', `could not save session template "${name}":`, err instanceof Error ? err.message : err);
    return { ok: false, templates: await readSessionTemplates() };
  }
  return { ok: true, templates: await readSessionTemplates() };
}

/** Delete the template called `name`; deleting one that is not there changes nothing. */
export async function deleteSessionTemplate(name: unknown): Promise<SessionTemplatesResult> {
  if (typeof name !== 'string' || !name) return { ok: true, templates: await readSessionTemplates() };
  try {
    await new SessionTemplateCollection().mutate((rows) => {
      const kept = rows.filter((row) => row.name !== name);
      return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
    });
  } catch (err) {
    console.error('[node-backend]', `could not delete session template "${name}":`, err instanceof Error ? err.message : err);
    return { ok: false, templates: await readSessionTemplates() };
  }
  return { ok: true, templates: await readSessionTemplates() };
}
