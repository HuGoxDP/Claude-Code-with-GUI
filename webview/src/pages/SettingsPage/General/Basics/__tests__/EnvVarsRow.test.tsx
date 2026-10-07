/** Claude's env block, edited one variable at a time. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';
import { resources } from '@/i18n/config';

const sendMock = vi.fn();
const refreshMock = vi.fn();
let mockEnv: Record<string, unknown> | undefined;
let mockScope: 'global' | 'project' = 'global';

vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send: sendMock }) }));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/repo' }) }));
vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ scope: mockScope, scopeSettings: { env: mockEnv }, refreshSettings: refreshMock }),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

import { EnvVarsRow } from '../EnvVarsRow';
import { envEntries, isSecretEnvName } from '../EnvVarsRow/envVars';

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ status: 'ok' });
  refreshMock.mockReset();
  mockEnv = { HTTPS_PROXY: 'http://proxy:8080', ANTHROPIC_AUTH_TOKEN: 'sk-secret' };
  mockScope = 'global';
});

describe('EnvVarsRow', () => {
  it('lists the variables, sorted, with a key masked', () => {
    render(<EnvVarsRow />);
    expect(screen.getByText('Variables: 2')).toBeTruthy();
    const token = screen.getByLabelText('Value of ANTHROPIC_AUTH_TOKEN') as HTMLInputElement;
    const proxy = screen.getByLabelText('Value of HTTPS_PROXY') as HTMLInputElement;
    expect(token.type).toBe('password');
    expect(proxy.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Show value' }));
    expect(token.type).toBe('text');
  });

  it('saves a changed value when focus leaves, at the scope on screen', async () => {
    render(<EnvVarsRow />);
    const proxy = screen.getByLabelText('Value of HTTPS_PROXY');
    fireEvent.change(proxy, { target: { value: 'http://other:3128' } });
    fireEvent.blur(proxy);
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(MessageType.SAVE_CLAUDE_ENV_VAR, {
        name: 'HTTPS_PROXY',
        value: 'http://other:3128',
        scope: 'global',
        workingDir: '/repo',
      }),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it('does not save a value left as it was', () => {
    render(<EnvVarsRow />);
    fireEvent.blur(screen.getByLabelText('Value of HTTPS_PROXY'));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('removes a variable by sending null', async () => {
    render(<EnvVarsRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove HTTPS_PROXY' }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(MessageType.SAVE_CLAUDE_ENV_VAR, expect.objectContaining({ name: 'HTTPS_PROXY', value: null })),
    );
  });

  it('adds a variable, and refuses a name a process cannot carry', async () => {
    render(<EnvVarsRow />);
    fireEvent.change(screen.getByLabelText('NAME'), { target: { value: '9LIVES' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('A name is letters, digits and _, and does not start with a digit.')).toBeTruthy();
    expect(sendMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('NAME'), { target: { value: 'API_TIMEOUT_MS' } });
    fireEvent.change(screen.getByLabelText('value'), { target: { value: '600000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        MessageType.SAVE_CLAUDE_ENV_VAR,
        expect.objectContaining({ name: 'API_TIMEOUT_MS', value: '600000', scope: 'global' }),
      ),
    );
  });

  it('warns in the project tab that the file is usually shared', () => {
    mockScope = 'project';
    render(<EnvVarsRow />);
    expect(screen.getByText(/usually shared through git/)).toBeTruthy();
  });

  it('is translated in every locale', () => {
    for (const locale of Object.keys(resources)) {
      const e = (resources[locale].settings as any).general?.envVars;
      for (const key of ['label', 'description', 'count', 'empty', 'add', 'remove', 'valueOf', 'show', 'hide', 'invalidName', 'saveFailed', 'projectNote']) {
        expect(e?.[key], `${locale} ${key}`).toBeTruthy();
      }
      expect(e.count, locale).toContain('{{count}}');
      expect(e.remove, locale).toContain('{{name}}');
    }
  });
});

describe('env helpers', () => {
  it('treats keys and tokens as secrets', () => {
    for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'GITHUB_TOKEN', 'DB_PASSWORD', 'MY_SECRET']) {
      expect(isSecretEnvName(name), name).toBe(true);
    }
    expect(isSecretEnvName('HTTPS_PROXY')).toBe(false);
    expect(isSecretEnvName('ANTHROPIC_BASE_URL')).toBe(false);
  });

  it('shows numbers and booleans as text, and leaves out what is not a value', () => {
    expect(envEntries({ B: 1, A: true, C: 'x', D: { nested: 1 }, E: null })).toEqual([
      ['A', 'true'],
      ['B', '1'],
      ['C', 'x'],
    ]);
    expect(envEntries(undefined)).toEqual([]);
    expect(envEntries(['x'])).toEqual([]);
  });
});
