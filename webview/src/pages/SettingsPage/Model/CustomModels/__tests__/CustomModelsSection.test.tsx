/** Settings → Model → Custom models: list, add (with a refusal), edit, delete, and other windows' changes. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { MessageType } from '@/shared';

const send = vi.fn();
const listeners = new Map<string, (message: { payload?: unknown }) => void>();
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    send,
    subscribe: (type: string, handler: (message: { payload?: unknown }) => void) => {
      listeners.set(type, handler);
      return () => listeners.delete(type);
    },
  }),
}));

import { CustomModelsSection } from '../index';
import { customModelInfos, withCustomModels } from '@/hooks/queries/useCustomModels';
import { ModelInfo } from '@/types/ModelInfo';

const gateway = {
  id: 1,
  model: 'gw-large',
  label: 'Gateway large',
  description: 'Through the gateway',
  inputPrice: 3,
  outputPrice: 15,
  cacheWritePrice: null,
  cacheReadPrice: 0.3,
  updatedAt: 0,
};

let stored: Record<string, unknown>[];

function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CustomModelsSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  listeners.clear();
  stored = [gateway];
  send.mockReset().mockImplementation(async (type: string, payload: Record<string, unknown>) => {
    if (type === MessageType.GET_CUSTOM_MODELS) return { status: 'ok', ok: true, models: stored };
    if (type === MessageType.SAVE_CUSTOM_MODEL) {
      if (payload.model === 'gw-large' && payload.id === undefined) {
        return { status: 'error', ok: false, error: '"gw-large" is already in the list', models: stored };
      }
      stored = payload.id ? stored.map((m) => (m.id === payload.id ? { ...m, label: payload.label } : m)) : [...stored, { ...gateway, id: 2, model: payload.model, label: null, description: null, inputPrice: null, outputPrice: null, cacheReadPrice: null }];
      return { status: 'ok', ok: true, models: stored };
    }
    if (type === MessageType.DELETE_CUSTOM_MODEL) {
      stored = stored.filter((m) => m.id !== payload.id);
      return { status: 'ok', ok: true, models: stored };
    }
    return { status: 'ok' };
  });
});

describe('CustomModelsSection', () => {
  it('lists each model with its name, model, description and the prices it has', async () => {
    renderSection();
    expect(await screen.findByText('Gateway large')).toBeTruthy();
    expect(screen.getByText('gw-large')).toBeTruthy();
    expect(screen.getByText('Through the gateway')).toBeTruthy();
    expect(screen.getByText('Per million tokens: $3.00 input · $15.00 output · $0.30 cache read')).toBeTruthy();
  });

  it('adds a model with what was typed, and shows a refusal where the form is', async () => {
    renderSection();
    await screen.findByText('Gateway large');
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'gw-large' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('"gw-large" is already in the list')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'local-coder' } });
    fireEvent.change(screen.getByLabelText('Output'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getAllByTestId('custom-model')).toHaveLength(2));
    expect(send).toHaveBeenCalledWith(MessageType.SAVE_CUSTOM_MODEL, expect.objectContaining({ model: 'local-coder', outputPrice: '0', label: '' }));
    expect(screen.getByText('No prices')).toBeTruthy();
  });

  it('changes a model in place, and deletes one after asking', async () => {
    renderSection();
    await screen.findByText('Gateway large');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('Model name') as HTMLInputElement).value).toBe('gw-large');
    expect((screen.getByLabelText('Cache read') as HTMLInputElement).value).toBe('0.3');
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Large' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Large')).toBeTruthy();
    expect(send).toHaveBeenCalledWith(MessageType.SAVE_CUSTOM_MODEL, expect.objectContaining({ id: 1, label: 'Large' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirms = await screen.findAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirms[confirms.length - 1]);
    await waitFor(() => expect(screen.queryAllByTestId('custom-model')).toHaveLength(0));
    expect(send).toHaveBeenCalledWith(MessageType.DELETE_CUSTOM_MODEL, { id: 1 });
  });

  it('shows a change made in another window', async () => {
    renderSection();
    await screen.findByText('Gateway large');
    act(() => listeners.get(MessageType.CUSTOM_MODELS_CHANGED)?.({ payload: { models: [] } }));
    await waitFor(() => expect(screen.queryAllByTestId('custom-model')).toHaveLength(0));
  });
});

describe('custom model rows', () => {
  it('go by the given name, or the model name, and come before the catalog as one row with what it knows', () => {
    const custom = customModelInfos([
      gateway,
      { ...gateway, id: 2, model: 'local', label: null, description: null },
      { ...gateway, id: 3, model: 'sonnet', description: null },
      { ...gateway, id: 4, model: 'gw-small', label: 'Small', description: null },
    ]);
    expect(custom.map((m) => [m.label, m.rowText.blurb, m.isCustom])).toEqual([
      ['Gateway large', 'Through the gateway', true],
      ['local', undefined, true],
      ['Gateway large', 'sonnet', true],
      // Named, no description: the model name it is picked by goes under the name.
      ['Small', 'gw-small', true],
    ]);
    const catalog = [
      ModelInfo.from({ value: 'default', displayName: 'Default' }),
      ModelInfo.from({ value: 'sonnet', displayName: 'Sonnet', description: 'Everyday', supportsEffort: true }),
    ];
    const list = withCustomModels(catalog, custom);
    expect(list.map((m) => m.value)).toEqual(['gw-large', 'local', 'sonnet', 'gw-small', 'default']);
    // The catalog's row for the same model takes the user's name, keeps what the CLI says.
    expect([list[2].label, list[2].rowText.blurb, list[2].isCustom, list[2].supportsEffort]).toEqual(['Gateway large', 'Everyday', true, true]);
    expect(withCustomModels(catalog, [])).toBe(catalog);
    expect(catalog.every((m) => !m.isCustom)).toBe(true);
  });
});
