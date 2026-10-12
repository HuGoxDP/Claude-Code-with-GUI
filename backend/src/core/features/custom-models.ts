import { EntityChange } from '../entities/AbstractEntityCollection';
import { CustomModelCollection } from '../entities/provider/CustomModel.collection';
import { CustomModel, type CustomModelFields } from '../entities/provider/CustomModel.entity';

/**
 * Custom models: model names the user adds to the model picker, ported from CC
 * GUI's custom models.
 *
 * In the terminal, `claude --model <name>` and `/model <name>` take any name the
 * endpoint knows, not only the ones Claude Code lists. The picker shows Claude
 * Code's list, so a model behind another endpoint (see the API providers) could
 * not be picked. A custom model puts such a name in the picker, and choosing it
 * does exactly what `/model <name>` does.
 *
 * Prices are optional and only matter to the usage history, for models Claude
 * Code records tokens for but cannot price.
 */

const MODEL_MAX = 200;
const LABEL_MAX = 80;
const DESCRIPTION_MAX = 200;
/** Dollars per million tokens; anything above is a typo, not a price. */
const PRICE_MAX = 10_000;

/** One custom model as the webview sees it. */
export interface CustomModelView {
  id: number;
  model: string;
  label: string | null;
  description: string | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheWritePrice: number | null;
  cacheReadPrice: number | null;
  updatedAt: number;
}

export interface CustomModelsResult {
  ok: boolean;
  /** Why the change was refused, when the user can fix it. */
  error?: string;
  models: CustomModelView[];
}

/** Prices for one model, in dollars per million tokens. */
export interface ModelPrices {
  input: number | null;
  output: number | null;
  cacheWrite: number | null;
  cacheRead: number | null;
}

function view(model: CustomModel): CustomModelView {
  const { projectId: _projectId, ...rest } = model.toJSON();
  return rest;
}

export async function readCustomModels(extra: { ok?: boolean; error?: string } = {}): Promise<CustomModelsResult> {
  const models = (await new CustomModelCollection().inOrder()).map(view);
  return { ok: extra.ok ?? true, ...(extra.error ? { error: extra.error } : {}), models };
}

/** The prices the user gave, by model name; models without any price are left out. */
export async function customModelPrices(): Promise<Map<string, ModelPrices>> {
  const prices = new Map<string, ModelPrices>();
  for (const m of await new CustomModelCollection().all()) {
    if ([m.inputPrice, m.outputPrice, m.cacheWritePrice, m.cacheReadPrice].every((p) => p === null)) continue;
    prices.set(m.model, { input: m.inputPrice, output: m.outputPrice, cacheWrite: m.cacheWritePrice, cacheRead: m.cacheReadPrice });
  }
  return prices;
}

/** Trimmed text, null when empty, undefined when it is not text or too long. */
function optional(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? undefined : trimmed;
}

/** A price: null when not given, undefined when it is not one. */
function price(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= PRICE_MAX ? n : undefined;
}

/** Add a custom model, or change the one with [input.id]. */
export async function saveCustomModel(input: Record<string, unknown>): Promise<CustomModelsResult> {
  const refuse = (error: string) => readCustomModels({ ok: false, error });
  const model = optional(input.model, MODEL_MAX);
  // A model name is one word: Claude Code takes it as a single argument.
  if (!model || /[\s\p{Cc}]/u.test(model)) return refuse(`A model name is required: one word of at most ${MODEL_MAX} characters`);
  const label = optional(input.label, LABEL_MAX);
  if (label === undefined) return refuse(`A display name is at most ${LABEL_MAX} characters`);
  const description = optional(input.description, DESCRIPTION_MAX);
  if (description === undefined) return refuse(`A description is at most ${DESCRIPTION_MAX} characters`);
  const prices = {
    inputPrice: price(input.inputPrice),
    outputPrice: price(input.outputPrice),
    cacheWritePrice: price(input.cacheWritePrice),
    cacheReadPrice: price(input.cacheReadPrice),
  };
  if (Object.values(prices).some((p) => p === undefined)) return refuse(`A price is a number from 0 to ${PRICE_MAX}`);
  const id = typeof input.id === 'number' && Number.isInteger(input.id) ? input.id : null;
  const fields: CustomModelFields = { model, label, description, ...(prices as Record<keyof typeof prices, number | null>) };

  const collection = new CustomModelCollection();
  const all = await collection.all();
  if (all.some((m) => m.model === model && m.id !== id)) return refuse(`"${model}" is already in the list`);
  if (id !== null && !all.some((m) => m.id === id)) return refuse('That model is no longer in the list');

  try {
    const now = Date.now();
    if (id !== null) {
      await collection.mutate((rows) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return EntityChange.keep(rows, undefined);
        Object.assign(row, fields, { updatedAt: now });
        return EntityChange.write(rows, undefined);
      });
    } else {
      await collection.insertMissing([CustomModel.draft(fields, now)], (stored, candidate) => stored.model === candidate.model);
    }
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }
  return readCustomModels();
}

/** Take a custom model out of the list. A chat already on it stays on it. */
export async function deleteCustomModel(id: unknown): Promise<CustomModelsResult> {
  if (typeof id !== 'number') return readCustomModels();
  try {
    await new CustomModelCollection().mutate((rows) => {
      const kept = rows.filter((r) => r.id !== id);
      return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
    });
  } catch (err) {
    return readCustomModels({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  return readCustomModels();
}
