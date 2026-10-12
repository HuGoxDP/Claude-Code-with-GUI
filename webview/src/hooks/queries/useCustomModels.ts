import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { ModelInfo } from '@/types/ModelInfo';

/** One model the user added to the picker, as the backend hands it out. */
export interface CustomModelView {
  id: number;
  model: string;
  label: string | null;
  description: string | null;
  /** US dollars per million tokens; null when not given. */
  inputPrice: number | null;
  outputPrice: number | null;
  cacheWritePrice: number | null;
  cacheReadPrice: number | null;
  updatedAt: number;
}

/** What the form sends; prices as typed, '' for none. */
export interface CustomModelInput {
  id?: number;
  model: string;
  label: string;
  description: string;
  inputPrice: string;
  outputPrice: string;
  cacheWritePrice: string;
  cacheReadPrice: string;
}

interface CustomModelsReply {
  status?: string;
  ok?: boolean;
  error?: string;
  models?: CustomModelView[];
}

const QUERY_KEY = [MessageType.GET_CUSTOM_MODELS] as const;

/**
 * The models the user added to the model picker (features/custom-models.ts).
 * Every change answers with the whole list, and every window hears about it
 * (CUSTOM_MODELS_CHANGED), so all pickers show the same list.
 */
export function useCustomModels() {
  const { send, subscribe } = useBridgeContext();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const reply = await send<CustomModelsReply>(MessageType.GET_CUSTOM_MODELS, {});
      return reply?.models ?? [];
    },
  });

  useEffect(
    () =>
      subscribe(MessageType.CUSTOM_MODELS_CHANGED, (message) => {
        const models = (message.payload as { models?: CustomModelView[] } | undefined)?.models;
        if (Array.isArray(models)) queryClient.setQueryData(QUERY_KEY, models);
      }),
    [subscribe, queryClient],
  );

  /** Run a change; answers the reason it was refused, or null. */
  const run = useCallback(
    async (type: MessageType, payload: Record<string, unknown>): Promise<string | null> => {
      try {
        const reply = await send<CustomModelsReply>(type, payload);
        if (Array.isArray(reply?.models)) queryClient.setQueryData(QUERY_KEY, reply.models);
        return reply?.ok === false ? reply.error ?? 'Failed' : null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    [send, queryClient],
  );

  return {
    models: query.data ?? [],
    loaded: query.data !== undefined,
    save: (input: CustomModelInput) => run(MessageType.SAVE_CUSTOM_MODEL, { ...input }),
    remove: (id: number) => run(MessageType.DELETE_CUSTOM_MODEL, { id }),
  };
}

/** Custom models as picker rows: the name the user gave, and the line under it. */
export function customModelInfos(models: CustomModelView[]): ModelInfo[] {
  return models.map((m) =>
    ModelInfo.from({ value: m.model, displayName: m.label ?? '', description: m.description ?? '', custom: true }),
  );
}

/**
 * The picker's list: the user's models first (as CC GUI shows them), then
 * Claude Code's catalog. A custom model the catalog also lists — Claude Code
 * adds a "Custom model" row for the model a session runs on — becomes one row:
 * the user's name and place, with what the catalog knows about the model.
 */
export function withCustomModels(catalog: ModelInfo[], custom: ModelInfo[]): ModelInfo[] {
  if (custom.length === 0) return catalog;
  const byValue = new Map(catalog.map((m) => [m.value, m]));
  const merged = custom.map((c) => byValue.get(c.value)?.asCustom(c) ?? c);
  const taken = new Set(custom.map((c) => c.value));
  return [...merged, ...catalog.filter((m) => !taken.has(m.value))];
}

/** The custom models as picker rows, kept the same object while the list does not change. */
export function useCustomModelInfos(): ModelInfo[] {
  const { models } = useCustomModels();
  return useMemo(() => customModelInfos(models), [models]);
}
