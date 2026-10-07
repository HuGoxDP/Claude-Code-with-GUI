import { useEffect, useMemo, useRef } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { resolvePanelId } from '@/api/bridge/resolvePanelId';
import { isJetBrains } from '@/config/environment';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { useTranslation } from '@/i18n';
import { MessageType, resolveSessionActivity } from '@/shared';
import { INPUT_MODES } from '@/types/chatInput';
import { calculateContextWindowPercent } from '@/utils/contextWindow';
import { composeChatStatus, type ChatStatus } from './chatStatus';
import { useCurrentModelLabel } from './useCurrentModelLabel';

/**
 * Tell the IDE what its status bar should say about this chat: whether Claude
 * is working or waiting for an answer, and how much of the context window is
 * used, with the conversation, model and mode in the tooltip (ported from CC
 * GUI's status bar widget).
 *
 * Reported again whenever any of that changes, and on every move into the
 * panel (with `focused`, which is what makes the bar speak for this chat rather
 * than another). The backend passes on only what changes something, so the
 * clicks cost nothing past the socket.
 *
 * Only inside the IDE: a browser has no status bar, and the composer already
 * shows the same facts. Leaving the chat screen says there is nothing to show,
 * so the bar goes back to the chat the user was in before.
 *
 * Mounted with the chat's header, which lives exactly as long as the chat screen.
 */
export function useReportChatStatus(isStreaming: boolean, isAwaitingUser: boolean): void {
  const { t, i18n } = useTranslation('chat');
  const { currentSession, inputMode } = useSessionContext();
  const { contextWindowUsage } = useChatStreamContext();
  const { label: modelLabel } = useCurrentModelLabel();
  const workingDir = useWorkingDirOrNull()?.workingDirectory ?? undefined;

  const contextPercent =
    contextWindowUsage && contextWindowUsage.contextWindow > 0
      ? calculateContextWindowPercent(
          contextWindowUsage.totalTokens,
          contextWindowUsage.contextWindow,
          contextWindowUsage.maxOutputTokens,
        )
      : null;
  const contextTokens = contextWindowUsage?.totalTokens ?? 0;
  const activity = resolveSessionActivity(isStreaming, isAwaitingUser);
  const title = currentSession?.title || null;

  const status: ChatStatus = useMemo(() => {
    const numberFormat = new Intl.NumberFormat(i18n.language);
    return composeChatStatus(
      {
        title,
        modelLabel,
        modeLabel: INPUT_MODES[inputMode]?.label ?? inputMode,
        contextPercent,
        contextTokens,
        activity,
      },
      {
        context: (percent) => t('chatStatus.context', { percent }),
        working: t('chatStatus.working'),
        waiting: t('chatStatus.waiting'),
        newChat: t('chatStatus.newChat'),
        model: (model) => t('chatStatus.model', { model }),
        mode: (mode) => t('chatStatus.mode', { mode }),
        contextDetail: (percent, tokens) => t('chatStatus.contextDetail', { percent, tokens }),
        workingDetail: t('chatStatus.workingDetail'),
        waitingDetail: t('chatStatus.waitingDetail'),
        click: t('chatStatus.click'),
        formatNumber: (value) => numberFormat.format(value),
      },
    );
  }, [t, i18n.language, title, modelLabel, inputMode, contextPercent, contextTokens, activity]);

  // The listeners below are registered once, so they read the latest status here.
  const statusRef = useRef(status);
  const workingDirRef = useRef(workingDir);
  useEffect(() => {
    statusRef.current = status;
    workingDirRef.current = workingDir;
  }, [status, workingDir]);

  useEffect(() => {
    if (!isJetBrains()) return;
    report(status, workingDir, document.hasFocus());
  }, [status, workingDir]);

  useEffect(() => {
    if (!isJetBrains()) return;
    // The same signals the panel-focus report listens to: inside one IDE window,
    // moving between two chats fires neither window focus nor blur, but a click
    // or a focused field does (see usePanelFocusReporter).
    const onFocus = () => report(statusRef.current, workingDirRef.current, true);
    window.addEventListener('focus', onFocus);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('pointerdown', onFocus);
    // A backend that restarted knows nothing of this chat until it hears again.
    const unsubscribe = getBridge().onConnectionChange((connected) => {
      if (connected) report(statusRef.current, workingDirRef.current, document.hasFocus());
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('pointerdown', onFocus);
      unsubscribe();
      report(null, workingDirRef.current, false);
    };
  }, []);
}

/** Fire-and-forget, like the focus report: nothing is answered, and the next report replaces a lost one. */
function report(status: ChatStatus | null, workingDir: string | undefined, focused: boolean): void {
  try {
    getBridge().sendRaw({
      type: MessageType.SET_CHAT_STATUS,
      payload: {
        panelId: resolvePanelId(),
        workingDir,
        focused,
        text: status?.text ?? null,
        tooltip: status?.tooltip ?? null,
      },
      timestamp: Date.now(),
    });
  } catch {
    // Socket not open yet; the connection-ready report covers it.
  }
}
