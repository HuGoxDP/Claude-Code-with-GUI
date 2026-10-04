import { describe, it, expect, vi, beforeEach } from 'vitest';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

import { exportFileNameOf, matchesExportCommand, runExportCommand } from '../ExportCommand';

describe('matchesExportCommand', () => {
  it('matches /export alone or with a file name', () => {
    expect(matchesExportCommand('/export')).toBe(true);
    expect(matchesExportCommand('/export notes.md')).toBe(true);
  });

  it('does not match other words or a mid-sentence /export', () => {
    expect(matchesExportCommand('/exporter')).toBe(false);
    expect(matchesExportCommand('please /export')).toBe(false);
  });

  it('reads the file name after the command', () => {
    expect(exportFileNameOf('/export')).toBeUndefined();
    expect(exportFileNameOf('/export   my chat.jsonl ')).toBe('my chat.jsonl');
  });
});

describe('runExportCommand', () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it('says there is nothing to export in a chat that has not started', async () => {
    const exportSession = vi.fn();
    await runExportCommand(null, exportSession);
    expect(exportSession).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it('exports the current session and reports where it went', async () => {
    const exportSession = vi.fn().mockResolvedValue({ status: 'ok', path: '/tmp/a.md', format: 'markdown' });
    await runExportCommand('s1', exportSession, 'a.md');
    expect(exportSession).toHaveBeenCalledWith('s1', { fileName: 'a.md' });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(String(toastMock.success.mock.calls[0][0])).toContain('/tmp/a.md');
  });

  it('stays quiet when the save dialog is cancelled', async () => {
    const exportSession = vi.fn().mockResolvedValue({ status: 'ok', path: null });
    await runExportCommand('s1', exportSession);
    expect(exportSession).toHaveBeenCalledWith('s1', {});
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('reports a failure', async () => {
    const exportSession = vi.fn().mockResolvedValue({ status: 'error', error: 'disk full' });
    await runExportCommand('s1', exportSession);
    expect(String(toastMock.error.mock.calls[0][0])).toContain('disk full');
  });
});
