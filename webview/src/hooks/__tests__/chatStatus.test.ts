import { describe, it, expect } from 'vitest';
import { SessionActivity } from '@/shared';
import { composeChatStatus, type ChatStatusFacts, type ChatStatusWords } from '../chatStatus';

const words: ChatStatusWords = {
  context: (percent) => `${percent}% context`,
  working: 'working',
  waiting: 'waiting for you',
  newChat: 'New chat',
  model: (model) => `Model: ${model}`,
  mode: (mode) => `Mode: ${mode}`,
  contextDetail: (percent, tokens) => `Context: ${percent}% used (${tokens} tokens)`,
  workingDetail: 'Claude is working on a reply',
  waitingDetail: 'Claude is waiting for your answer',
  click: 'Click to show this chat',
  formatNumber: (value) => value.toLocaleString('en-US'),
};

const facts: ChatStatusFacts = {
  title: 'Fix the login form',
  modelLabel: 'Sonnet',
  modeLabel: 'Plan mode',
  contextPercent: 34,
  contextTokens: 68000,
  activity: SessionActivity.Idle,
};

/**
 * The status bar's line carries only what changes on its own (activity and the
 * context used); the model and mode, which change only when the user changes
 * them, are in the tooltip, under the conversation they belong to.
 */
describe('composeChatStatus', () => {
  it('says how much context an idle chat uses, and names the chat in the tooltip', () => {
    expect(composeChatStatus(facts, words)).toEqual({
      text: 'Claude: 34% context',
      tooltip: [
        'Fix the login form',
        'Model: Sonnet',
        'Mode: Plan mode',
        'Context: 34% used (68,000 tokens)',
        'Click to show this chat',
      ].join('\n'),
    });
  });

  it('puts working first while a reply is being written', () => {
    const status = composeChatStatus({ ...facts, activity: SessionActivity.Running }, words);
    expect(status.text).toBe('Claude: working · 34% context');
    expect(status.tooltip).toContain('Claude is working on a reply');
  });

  it('says it is waiting while a prompt waits for an answer', () => {
    const status = composeChatStatus({ ...facts, activity: SessionActivity.Awaiting }, words);
    expect(status.text).toBe('Claude: waiting for you · 34% context');
    expect(status.tooltip).toContain('Claude is waiting for your answer');
  });

  it('leaves the context out until the CLI has said how big the window is', () => {
    const status = composeChatStatus({ ...facts, contextPercent: null }, words);
    expect(status.text).toBe('Claude');
    expect(status.tooltip).not.toContain('Context:');
  });

  it('leaves the model out until the composer knows its name', () => {
    const status = composeChatStatus({ ...facts, modelLabel: null }, words);
    expect(status.tooltip).not.toContain('Model:');
    expect(status.tooltip).toContain('Mode: Plan mode');
  });

  it('calls a chat that has not started a new chat', () => {
    const status = composeChatStatus({ ...facts, title: null, contextPercent: null }, words);
    expect(status.tooltip.split('\n')[0]).toBe('New chat');
  });
});
