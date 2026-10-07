import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readFontFile } from '../features/fontFiles';

/**
 * GET_FONT_FILE — the bytes of the font file a font setting names, for the
 * webview to register as a FontFace (see features/fontFiles.ts).
 *
 * A file that cannot be used answers `status: 'error'` with a `code`, not a
 * message: the settings row words it in the user's language, and the chat
 * simply keeps its built-in font.
 */
export async function getFontFileHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const path = message.payload?.path;
  if (typeof path !== 'string' || path.trim() === '') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'path is required',
    });
    return;
  }

  const result = await readFontFile(path);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...result,
  });
}
