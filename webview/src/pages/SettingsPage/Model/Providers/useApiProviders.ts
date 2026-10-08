import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useBridge } from '@/hooks/useBridge';
import { MessageType } from '@/shared';

/** One provider as the backend hands it out: everything but the key. */
export interface ApiProviderView {
  id: number;
  name: string;
  baseUrl: string | null;
  authVar: string;
  hasKey: boolean;
  model: string | null;
  opusModel: string | null;
  sonnetModel: string | null;
  haikuModel: string | null;
  fableModel: string | null;
  updatedAt: number;
}

/** What the user settings use: Claude login, one provider, or variables set some other way. */
export type ApiProviderInUse = { kind: 'login' } | { kind: 'provider'; id: number } | { kind: 'other' };

export interface ApiProvidersReply {
  status?: string;
  ok: boolean;
  error?: string;
  providers: ApiProviderView[];
  inUse: ApiProviderInUse;
}

/** The fields a provider is saved with; `key` absent keeps the stored one, '' removes it. */
export interface ApiProviderInput {
  id?: number;
  name: string;
  baseUrl: string;
  authVar: string;
  key?: string;
  model: string;
  opusModel: string;
  sonnetModel: string;
  haikuModel: string;
  fableModel: string;
}

const QUERY_KEY = [MessageType.GET_API_PROVIDERS] as const;

/**
 * The API providers and the one in use (features/api-providers.ts). Every change
 * answers with the whole list, which replaces the cached one; a refusal comes
 * back as `error` for the caller to show where the user is.
 */
export function useApiProviders() {
  const { send } = useBridge();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => send<ApiProvidersReply>(MessageType.GET_API_PROVIDERS, {}),
  });

  const run = useCallback(
    async (type: MessageType, payload: Record<string, unknown>): Promise<string | null> => {
      try {
        const reply = await send<ApiProvidersReply>(type, payload);
        if (reply?.providers) queryClient.setQueryData(QUERY_KEY, reply);
        return reply?.ok === false ? reply.error ?? 'Failed' : null;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        toast.error(text);
        return text;
      }
    },
    [send, queryClient],
  );

  return {
    providers: query.data?.providers ?? [],
    inUse: query.data?.inUse ?? ({ kind: 'login' } as ApiProviderInUse),
    loaded: query.data !== undefined,
    save: (input: ApiProviderInput) => run(MessageType.SAVE_API_PROVIDER, { ...input }),
    remove: (id: number) => run(MessageType.DELETE_API_PROVIDER, { id }),
    use: (id: number | null) => run(MessageType.APPLY_API_PROVIDER, { id }),
  };
}
