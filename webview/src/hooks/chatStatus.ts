import { SessionActivity } from '@/shared';

/**
 * What the IDE's status bar says about this chat (ported from CC GUI's status
 * bar widget): one short line, and a tooltip of one fact per line.
 *
 * The bar is for keeping an eye on the chat while it is out of sight, so the
 * line carries only what changes on its own: whether Claude is working or
 * waiting for an answer, and how much of the context window is used. The model
 * and mode change only when the user changes them, and sit in the tooltip.
 */
export interface ChatStatus {
  text: string;
  tooltip: string;
}

export interface ChatStatusFacts {
  /** The conversation's title, or null for a chat that has not started. */
  title: string | null;
  /** The model as the composer names it, or null before the CLI's model list has arrived. */
  modelLabel: string | null;
  /** The mode as the composer names it. */
  modeLabel: string;
  /** Percent of the context window used, or null before the CLI has said how big it is. */
  contextPercent: number | null;
  /** Tokens in the context, shown next to the percent. */
  contextTokens: number;
  activity: SessionActivity;
}

/** The strings the status is made of, in the user's language. */
export interface ChatStatusWords {
  context: (percent: number) => string;
  working: string;
  waiting: string;
  newChat: string;
  model: (model: string) => string;
  mode: (mode: string) => string;
  contextDetail: (percent: number, tokens: string) => string;
  workingDetail: string;
  waitingDetail: string;
  click: string;
  formatNumber: (value: number) => string;
}

/** The product's name on the line, so the bar says whose status it is. */
const PREFIX = 'Claude';

export function composeChatStatus(facts: ChatStatusFacts, words: ChatStatusWords): ChatStatus {
  const parts: string[] = [];
  if (facts.activity === SessionActivity.Running) parts.push(words.working);
  else if (facts.activity === SessionActivity.Awaiting) parts.push(words.waiting);
  if (facts.contextPercent !== null) parts.push(words.context(facts.contextPercent));

  const lines = [facts.title || words.newChat];
  // Left out rather than guessed: until the list arrives, the only name to hand
  // is the raw setting ("default"), which is not the name the composer shows.
  if (facts.modelLabel !== null) lines.push(words.model(facts.modelLabel));
  lines.push(words.mode(facts.modeLabel));
  if (facts.contextPercent !== null) {
    lines.push(words.contextDetail(facts.contextPercent, words.formatNumber(facts.contextTokens)));
  }
  if (facts.activity === SessionActivity.Running) lines.push(words.workingDetail);
  else if (facts.activity === SessionActivity.Awaiting) lines.push(words.waitingDetail);
  lines.push(words.click);

  return {
    text: parts.length > 0 ? `${PREFIX}: ${parts.join(' · ')}` : PREFIX,
    tooltip: lines.join('\n'),
  };
}
