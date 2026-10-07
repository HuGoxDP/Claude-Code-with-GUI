import { describe, it, expect, vi } from 'vitest';
import { applySessionTemplate, choicesOf, templateSummary, ULTRACODE_TEMPLATE_EFFORT, type SessionTemplate } from '../sessionTemplate';
import type { InputMode } from '@/types/chatInput';

const template = (over: Partial<SessionTemplate> = {}): SessionTemplate => ({
  name: 'review', model: 'opus', inputMode: 'plan', effort: 'high', updatedAt: 1, ...over,
});

describe('choicesOf', () => {
  it('keeps the chat choices, with the top effort step as ultracode', () => {
    expect(choicesOf('opus', 'plan', 'high', false)).toEqual({ model: 'opus', inputMode: 'plan', effort: 'high' });
    expect(choicesOf('opus', 'plan', 'xhigh', true).effort).toBe(ULTRACODE_TEMPLATE_EFFORT);
  });
});

describe('templateSummary', () => {
  it('reads each choice the way the composer names it', () => {
    expect(templateSummary(template())).toBe('Opus · Plan mode · High');
    expect(templateSummary(template({ model: 'default', inputMode: 'ask_before_edit', effort: 'xhigh' })))
      .toBe('Default · Ask before edits · Extra high');
    expect(templateSummary(template({ effort: ULTRACODE_TEMPLATE_EFFORT }))).toBe('Opus · Plan mode · Ultracode');
  });

  it('leaves out what the template does not set', () => {
    expect(templateSummary(template({ model: null, effort: null }))).toBe('Plan mode');
  });
});

describe('applySessionTemplate', () => {
  const targets = () => {
    const calls: string[] = [];
    return {
      calls,
      switchModel: vi.fn(async (model: string) => { calls.push(`model:${model}`); }),
      setInputMode: vi.fn((mode: InputMode) => { calls.push(`mode:${mode}`); }),
      availableModes: ['plan', 'ask_before_edit', 'auto_edit'] as InputMode[],
      setEffort: vi.fn(async (effort: string) => { calls.push(`effort:${effort}`); }),
    };
  };

  it('sets the model, then the mode, then the effort', async () => {
    const t = targets();
    await applySessionTemplate(template(), t);
    expect(t.calls).toEqual(['model:opus', 'mode:plan', 'effort:high']);
  });

  it('leaves alone what the template does not set', async () => {
    const t = targets();
    await applySessionTemplate(template({ model: null, inputMode: null, effort: null }), t);
    expect(t.calls).toEqual([]);
  });

  it('skips a mode this chat does not offer, or one it does not know', async () => {
    const t = targets();
    await applySessionTemplate(template({ inputMode: 'bypass' }), t);
    await applySessionTemplate(template({ inputMode: 'nonsense' }), t);
    expect(t.setInputMode).not.toHaveBeenCalled();
  });
});
