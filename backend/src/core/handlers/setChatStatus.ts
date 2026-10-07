import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { logDebug } from '../../logging/log-level';

/** The longest status line passed on; the IDE's status bar has room for far less. */
const TEXT_MAX = 200;
/** The longest tooltip passed on: a few lines, one of them the conversation's title. */
const TOOLTIP_MAX = 2000;

/**
 * What each panel's status was when last passed on, so a report that changes
 * nothing stops here. The webview reports on every click into the chat (that is
 * how it says "I have focus"), and every request to the IDE is a line in both
 * logs.
 */
const lastForwarded = new Map<string, string>();
/** The panel whose focus was last passed on; a second claim from it says nothing new. */
let lastFocusedPanelId: string | null = null;

/** Forget what was passed on, so the next report goes through. Tests only. */
export function resetChatStatusForTests(): void {
  lastForwarded.clear();
  lastFocusedPanelId = null;
}

/**
 * Hand what a chat page says about itself to the host, for the IDE's status bar
 * (ported from CC GUI's status bar widget).
 *
 * The words are the webview's: it already draws the same facts in the composer
 * and has the user's language. This only checks the shape and passes it on. No
 * answer is sent; the webview reports and moves on, and a status that did not
 * land is replaced by the next.
 */
export async function setChatStatusHandler(
  _connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const payload = message.payload ?? {};
  const panelId = payload.panelId;
  if (typeof panelId !== 'string' || panelId.length === 0) return;

  const workingDirValue = payload.workingDir;
  const workingDir =
    typeof workingDirValue === 'string' && workingDirValue.length > 0 ? workingDirValue : undefined;

  const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, TEXT_MAX) : '';
  const tooltip = typeof payload.tooltip === 'string' ? payload.tooltip.slice(0, TOOLTIP_MAX) : '';
  const status = text ? { text, tooltip } : null;
  const focused = payload.focused === true;

  const key = JSON.stringify(status);
  const changed = (lastForwarded.get(panelId) ?? 'null') !== key;
  const claimsFocus = focused && lastFocusedPanelId !== panelId;
  if (!changed && !claimsFocus) return;
  if (status) lastForwarded.set(panelId, key);
  else lastForwarded.delete(panelId);
  if (focused) lastFocusedPanelId = panelId;

  try {
    await bridge.setChatStatus({ panelId, workingDir, focused, status });
  } catch (err) {
    // Debug, not error: this fires on every change of the chat's state and focus,
    // and a status that did not land is a stale line rather than a fault.
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    logDebug('[node-backend]', `bridge.setChatStatus() failed: ${msg}`);
  }
}
