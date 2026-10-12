import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { getUsageHistory } from '../features/usage-history';

/** Longest period asked for: a year, so one request cannot ask to read all time. */
const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000;

/** GET_USAGE_HISTORY — tokens and cost over a period (the usage history). See usage-history.ts. */
export async function getUsageHistoryHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const reply = (body: Record<string, unknown>) =>
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
  const since = (message.payload as { since?: unknown } | undefined)?.since;
  if (typeof since !== 'number' || !Number.isFinite(since)) {
    return reply({ status: 'error', error: 'since (epoch ms) is required' });
  }
  try {
    const history = await getUsageHistory(Math.max(since, Date.now() - MAX_PERIOD_MS));
    reply({ status: 'ok', ...history });
  } catch (err) {
    reply({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
