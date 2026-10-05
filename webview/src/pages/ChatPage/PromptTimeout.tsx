import { useEffect, useRef, useState } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

/** The values the timeout setting offers, in seconds. */
export const PROMPT_TIMEOUT_CHOICES = [30, 60, 120, 300, 600, 1800, 3600] as const;

/** Under this many seconds the countdown turns to the warning color. */
export const PROMPT_TIMEOUT_WARNING_SECONDS = 30;

/**
 * Seconds left before the prompt identified by [key] is declined, or null when
 * no timer runs: no prompt, or no timeout set.
 *
 * The deadline is fixed when a prompt appears and measured against the clock,
 * not by counting ticks: a hidden tab runs its timers late, and a count would
 * let the prompt outlive its deadline by however long the tab slept. A new key
 * starts a new deadline; the same key keeps its own, so a re-render, or the
 * panel being collapsed and expanded, does not restart the wait.
 *
 * [onTimeout] runs once per prompt, with the latest callback.
 */
export function usePromptTimeout(key: string | null, seconds: number | null, onTimeout: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (key === null || seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
      setRemaining(null);
      return;
    }
    const deadline = Date.now() + seconds * 1000;
    let fired = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !fired) {
        fired = true;
        window.clearInterval(timer);
        onTimeoutRef.current();
      }
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [key, seconds]);

  return remaining;
}

/** `4:59`, `0:07`, `1:00:00`. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * Said to Claude in place of an answer. English, like everything else the model
 * reads from this app, and plain about what happened: nobody chose "no".
 */
export function promptTimeoutReason(seconds: number): string {
  return `No answer came within ${formatCountdown(seconds)}, so this was declined automatically. `
    + 'The user may be away; continue without it if you can, or ask again later.';
}

/** A prompt the timer can run for: its identity, and how to decline it. */
export interface TimedPrompt {
  key: string;
  decline: (reason: string) => void;
}

interface PendingPrompts {
  question: { toolUseId: string; controlRequestId?: string } | null;
  planRequestId: string | null;
  permissionRequestId: string | null;
}

interface DeclineActions {
  declineQuestion: (toolUseId: string, controlRequestId: string, reason: string) => void;
  declinePlan: (controlRequestId: string, reason: string) => void;
  declinePermission: (controlRequestId: string, reason: string) => void;
}

/**
 * The prompt on screen, in the order the chat footer picks its panel: question,
 * then plan, then permission. A question the CLI asked without a request id
 * cannot be answered by id, so it gets no timer rather than a decline that would
 * go nowhere.
 */
export function pickTimedPrompt(pending: PendingPrompts, actions: DeclineActions): TimedPrompt | null {
  const { question, planRequestId, permissionRequestId } = pending;
  if (question) {
    const { toolUseId, controlRequestId } = question;
    return controlRequestId
      ? { key: `question:${controlRequestId}`, decline: (reason) => actions.declineQuestion(toolUseId, controlRequestId, reason) }
      : null;
  }
  if (planRequestId) return { key: `plan:${planRequestId}`, decline: (reason) => actions.declinePlan(planRequestId, reason) };
  if (permissionRequestId) {
    return { key: `permission:${permissionRequestId}`, decline: (reason) => actions.declinePermission(permissionRequestId, reason) };
  }
  return null;
}

/** The line above a waiting prompt that says when it will be declined. */
export function PromptTimeoutNotice({ remaining }: { remaining: number }) {
  const { t } = useTranslation('chat');
  const warning = remaining <= PROMPT_TIMEOUT_WARNING_SECONDS;
  return (
    <div
      role="timer"
      aria-live={warning ? 'polite' : 'off'}
      data-testid="prompt-timeout"
      // The width the prompt panels use, so the line sits over the panel it is about.
      className="w-full max-w-[44rem] mx-auto px-4"
    >
      <div className={`flex items-center gap-1.5 px-1 text-xs ${warning ? 'text-state-warning-fg' : 'text-text-secondary'}`}>
        <ClockIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{t('promptTimeout.countdown', { time: formatCountdown(remaining) })}</span>
      </div>
    </div>
  );
}
