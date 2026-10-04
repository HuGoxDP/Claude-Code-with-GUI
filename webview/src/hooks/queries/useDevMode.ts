import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * Whether the backend runs in dev mode (dev build, or the IDE was launched via
 * run-ide). Asked of the backend rather than read from `import.meta.env.DEV`,
 * because under run-ide the webview is a production build. Gates test-only
 * controls; false while unknown.
 */
export function useDevMode(): boolean {
  const { isConnected, send } = useBridgeContext();
  const query = useQuery<boolean, Error>({
    queryKey: [MessageType.GET_DEV_MODE],
    enabled: isConnected,
    staleTime: Infinity,
    queryFn: async () => {
      const res = (await send(MessageType.GET_DEV_MODE)) as { devMode?: boolean } | null;
      return res?.devMode === true;
    },
  });
  return query.data ?? false;
}
