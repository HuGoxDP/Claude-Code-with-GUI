import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const readFontFile = vi.fn();
vi.mock('../../features/fontFiles', () => ({
  readFontFile: (...a: unknown[]) => readFontFile(...a),
}));

const { getFontFileHandler } = await import('../getFontFile');

const bridge = {} as Bridge;
let sent: { type: string; payload: Record<string, unknown> }[] = [];
const connections = {
  sendTo: (_id: string, type: string, payload: Record<string, unknown>) => {
    sent.push({ type, payload });
  },
} as unknown as ConnectionManager;

function message(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GET_FONT_FILE, payload, requestId: 'r1', timestamp: 0 } as IPCMessage;
}

beforeEach(() => {
  sent = [];
  readFontFile.mockReset();
});

describe('getFontFileHandler', () => {
  it('answers with the file the setting names', async () => {
    readFontFile.mockResolvedValue({ status: 'ok', data: 'AAE=', format: 'truetype', size: 2 });

    await getFontFileHandler('c1', message({ path: '/fonts/Inter.ttf' }), connections, bridge);

    expect(readFontFile).toHaveBeenCalledWith('/fonts/Inter.ttf');
    expect(sent).toEqual([
      {
        type: MessageType.ACK,
        payload: { requestId: 'r1', status: 'ok', data: 'AAE=', format: 'truetype', size: 2 },
      },
    ]);
  });

  it('passes on why a file cannot be used, for the settings row to word', async () => {
    readFontFile.mockResolvedValue({ status: 'error', code: 'notFound' });

    await getFontFileHandler('c1', message({ path: '/fonts/Gone.ttf' }), connections, bridge);

    expect(sent[0].payload).toEqual({ requestId: 'r1', status: 'error', code: 'notFound' });
  });

  it('refuses a request without a path, without reading anything', async () => {
    await getFontFileHandler('c1', message({ path: '  ' }), connections, bridge);

    expect(readFontFile).not.toHaveBeenCalled();
    expect(sent[0].payload).toEqual({ requestId: 'r1', status: 'error', error: 'path is required' });
  });
});
