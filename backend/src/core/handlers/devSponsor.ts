import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { grantDevSponsor } from '../features/license';
import { isDevMode } from '../../config/environment';
import { MessageType } from '../../shared';

/** Tell the webview whether dev-only controls may be shown. */
export async function getDevModeHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    devMode: isDevMode(),
  });
}

/**
 * Dev-only: store a fake active sponsor license so sponsor-gated features can be
 * tested without paying. Refused outside dev mode, so a released build cannot be
 * unlocked by sending this message.
 */
export async function devGrantSponsorHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  if (!isDevMode()) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'dev mode only',
    });
    return;
  }
  await grantDevSponsor();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    isSponsor: true,
  });
}
