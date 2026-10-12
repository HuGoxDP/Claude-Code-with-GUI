import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModelInfo } from '@/types/slashCommand';
import { customModelInfos } from '@/hooks/queries/useCustomModels';

/** The picker lists the user's custom models first, and choosing one switches to its name. */

const switchModel = vi.fn(async () => undefined);
let mockCatalog: ModelInfo[] = [];
let mockCustom: ModelInfo[] = [];

vi.mock('@/hooks/useModelSwitch', () => ({ useModelSwitch: () => switchModel }));
vi.mock('@/hooks/queries/useCustomModels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useCustomModels')>()),
  useCustomModelInfos: () => mockCustom,
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sessionModel: null, setSessionModel: vi.fn(), appendMessage: vi.fn() }),
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: { response: { response: { models: mockCatalog } } } }),
}));
vi.mock('@/hooks/useCurrentModel', () => ({ useCurrentModel: () => 'default' }));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/tmp' }) }));
vi.mock('@/contexts/FableProbeContext', () => ({
  useFableProbe: () => ({ probedAvailable: null, probeFableAvailability: vi.fn() }),
  shouldProbeFable: () => false,
}));
vi.mock('@/hooks/useVersionInfo', () => ({ useVersionInfo: () => ({ cliVersion: '2.1.170' }) }));

import { ModelSwitchOverlay } from '../index';

const view = (over: Partial<Record<string, unknown>>) => ({
  id: 1,
  model: 'gw-large',
  label: null,
  description: null,
  inputPrice: null,
  outputPrice: null,
  cacheWritePrice: null,
  cacheReadPrice: null,
  updatedAt: 0,
  ...over,
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  switchModel.mockClear();
  mockCatalog = [
    ModelInfo.from({ value: 'default', displayName: 'Default (recommended)', description: 'Use the default model' }),
    ModelInfo.from({ value: 'sonnet', resolvedModel: 'sonnet', displayName: 'Sonnet', description: 'Everyday tasks' }),
  ];
  mockCustom = customModelInfos([
    view({ id: 1, model: 'gw-large', label: 'Gateway large', description: 'Through the gateway' }),
    view({ id: 2, model: 'local-coder' }),
    // Also in the catalog: one row, under the user's name, among the custom ones.
    view({ id: 3, model: 'sonnet', label: 'My sonnet' }),
  ]);
});

describe('custom models in the model picker', () => {
  it('lists them first, by the name the user gave, marked as custom', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    const rows = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(rows[0]).toContain('Gateway large');
    expect(rows[0]).toContain('Through the gateway');
    expect(rows[0]).toContain('Custom');
    // No name given: the model name, with nothing repeated under it.
    expect(rows[1]).toMatch(/^local-coder/);
    expect(rows[2]).toContain('My sonnet');
    expect(rows.filter((r) => r.includes('Everyday tasks'))).toHaveLength(1);
    expect(screen.getAllByText('Custom')).toHaveLength(3);
  });

  it('switches to the model name, as /model <name> does', async () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Gateway large'));
    await waitFor(() => expect(switchModel).toHaveBeenCalledWith('gw-large'));
  });

  it('answers /model <name> with a custom model', async () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} autoSelectQuery="local-coder" />);
    await waitFor(() => expect(switchModel).toHaveBeenCalledWith('local-coder'));
  });
});
