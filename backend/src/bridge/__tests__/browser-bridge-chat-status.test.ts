import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { execFile, spawn } from 'child_process';
import { BrowserBridge } from '../browser-bridge';

describe('BrowserBridge.setChatStatus', () => {
  it('does nothing and starts no process: a browser has no status bar, and the page shows it all', async () => {
    const bridge = new BrowserBridge();

    await expect(
      bridge.setChatStatus({
        panelId: 'p1',
        workingDir: '/proj',
        focused: true,
        status: { text: 'Claude: 34% context', tooltip: 'Fix the login' },
      }),
    ).resolves.toBeUndefined();

    expect(execFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});
