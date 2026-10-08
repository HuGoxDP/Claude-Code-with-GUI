/** API providers under Settings → Model. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { MessageType } from '@/shared';
import { resources } from '@/i18n/config';

const sendMock = vi.fn();
let mockScope: 'global' | 'project' = 'global';
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send: sendMock }) }));
vi.mock('@/contexts/ClaudeSettingsContext', () => ({ useClaudeSettings: () => ({ scope: mockScope }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { ProvidersSection } from '../index';

const gateway = {
  id: 7,
  name: 'Gateway',
  baseUrl: 'https://gateway.example/anthropic',
  authVar: 'ANTHROPIC_AUTH_TOKEN',
  hasKey: true,
  model: 'gw-large',
  opusModel: null,
  sonnetModel: 'gw-medium',
  haikuModel: null,
  fableModel: null,
  updatedAt: 1,
};
let reply: Record<string, unknown>;

function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ProvidersSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockScope = 'global';
  reply = { status: 'ok', ok: true, providers: [gateway], inUse: { kind: 'login' } };
  sendMock.mockReset().mockImplementation(async () => reply);
});

describe('ProvidersSection', () => {
  it('lists Claude login, in use, and the saved providers without their keys', async () => {
    renderSection();
    expect(await screen.findByText('Gateway')).toBeTruthy();
    expect(screen.getByText('In use')).toBeTruthy();
    expect(screen.getByText('https://gateway.example/anthropic')).toBeTruthy();
    expect(screen.getByText('gw-large · Sonnet → gw-medium')).toBeTruthy();
    expect(screen.getByText('Key in ANTHROPIC_AUTH_TOKEN')).toBeTruthy();
  });

  it('uses a provider', async () => {
    renderSection();
    await screen.findByText('Gateway');
    reply = { ...reply, inUse: { kind: 'provider', id: 7 } };
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.APPLY_API_PROVIDER, { id: 7 }));
  });

  it('adds a provider with its key', async () => {
    renderSection();
    await screen.findByText('Gateway');
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Direct' } });
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'sk-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        MessageType.SAVE_API_PROVIDER,
        expect.objectContaining({ name: 'Direct', authVar: 'ANTHROPIC_AUTH_TOKEN', key: 'sk-123', baseUrl: '' }),
      ),
    );
  });

  it('keeps the saved key when a provider is changed without typing one', async () => {
    renderSection();
    await screen.findByText('Gateway');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gw-xl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.SAVE_API_PROVIDER, expect.objectContaining({ id: 7, model: 'gw-xl' })));
    const payload = sendMock.mock.calls.find(([type]) => type === MessageType.SAVE_API_PROVIDER)![1];
    expect('key' in payload).toBe(false);
  });

  it('shows a refusal in the form', async () => {
    renderSection();
    await screen.findByText('Gateway');
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gateway' } });
    reply = { ...reply, status: 'error', ok: false, error: 'There is already a provider called "Gateway"' };
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('There is already a provider called "Gateway"')).toBeTruthy();
  });

  it('deletes after asking', async () => {
    renderSection();
    await screen.findByText('Gateway');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete "Gateway" and its saved key? Your settings stay as they are.')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.DELETE_API_PROVIDER, { id: 7 }));
  });

  it('says when the settings were set some other way', async () => {
    reply = { ...reply, inUse: { kind: 'other' } };
    renderSection();
    expect(await screen.findByText(/match none of these/)).toBeTruthy();
  });

  it('is inert in the project tab, which has no providers', async () => {
    mockScope = 'project';
    renderSection();
    expect(await screen.findByText('Providers live in User Settings, which every project reads.')).toBeTruthy();
  });

  it('is translated in every locale', () => {
    for (const locale of Object.keys(resources)) {
      const p = (resources[locale].settings as any).cli?.providers;
      for (const key of ['title', 'description', 'login', 'loginDetails', 'inUse', 'use', 'edit', 'delete', 'confirmDelete', 'add', 'keyIn', 'noKey', 'other', 'switched', 'userOnly']) {
        expect(p?.[key], `${locale} ${key}`).toBeTruthy();
      }
      for (const key of ['name', 'baseUrl', 'key', 'keyVar', 'keyKept', 'keyNew', 'removeKey', 'model', 'opusModel', 'sonnetModel', 'haikuModel', 'fableModel', 'cancel', 'save']) {
        expect(p?.form?.[key], `${locale} form.${key}`).toBeTruthy();
      }
      expect(p.confirmDelete, locale).toContain('{{name}}');
      expect(p.keyIn, locale).toContain('{{variable}}');
    }
  });
});
