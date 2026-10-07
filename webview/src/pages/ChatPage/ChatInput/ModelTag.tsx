import { useEffect } from 'react';
import { Tag } from '@/pages/ChatPage/ChatInput/Tag';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { modelChangeLabel } from '@/pages/ChatPage/modelChangeLabel';
import { resolveModelInfo, resolveModelLabel, toDisplayLabel } from '@/types/models';
import { useCurrentModelLabel } from '@/hooks/useCurrentModelLabel';
import { useModelSwitch } from '@/hooks/useModelSwitch';
import { LoadedMessageType } from '@/types';
import { ModelInfo } from '@/types/slashCommand';
import { useTranslation } from '@/i18n';

/** Fired by the ⌘/Ctrl+Shift+. shortcut to rotate to the next model. */
export const ROTATE_MODEL_EVENT = 'rotate-model';

/**
 * What the chip names.
 *
 * The chip answers "which model is running right now", which makes the
 * `default` row the one place where the row's own name is the wrong answer: it
 * names a choice ("follow whatever the default is"), not a model. The chip
 * spells out the model behind it instead. A default row the CLI did not resolve
 * (an older CLI omits the field) has no model to spell, so it keeps its name.
 *
 * Then the dated snapshot goes: "Haiku 4.5 (20251001)" eats the composer's
 * bottom row, and the date is the part least worth that space. A context suffix
 * like "(1M)" stays, because it changes which model you get. The tag's tooltip
 * still carries the name whole.
 */
export function chipLabel(info: ModelInfo): string {
  const full = info.isDefaultRow && info.resolvedModel
    ? toDisplayLabel(info.resolvedModel)
    : resolveModelLabel(info);
  return full.replace(/\s*\(\d{4,}\)/g, '');
}

/**
 * Always-on indicator of the current session model in the composer's
 * bottom bar. Clicking (or ⌘/Ctrl+Shift+M) opens the existing
 * `ModelSwitchOverlay`; ⌘/Ctrl+Shift+. rotates to the next model.
 *
 * The label is the real model name resolved from the CLI model info
 * (see `chipLabel`). If the current model can't be resolved
 * (models not loaded yet), the tag renders nothing.
 */
export function ModelTag() {
  const { t } = useTranslation('chat');
  const { appendMessage } = useChatStreamContext();
  const switchModel = useModelSwitch();
  // The same name the IDE status bar's tooltip gives, from one place.
  const { models, currentModel, info, label: resolvedLabel } = useCurrentModelLabel();

  useEffect(() => {
    const handleRotate = () => {
      if (models.length === 0) return;
      const info = resolveModelInfo(models, currentModel);
      const idx = info ? models.indexOf(info) : -1;
      const next = models[(idx + 1) % models.length];

      // Instant local feedback. The CLI's `/model` echo only appears once a
      // message is sent (and not at all if the process has exited), so this is
      // what makes the change visible immediately. The echo is deduped against
      // this notification in UserMessageRenderer, so they never double up; on
      // reload this (ephemeral) notification is gone and the echo takes over.
      appendMessage({
        type: LoadedMessageType.Notification,
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        summary: t('chatInput.modelTag.setModelNotification', { model: modelChangeLabel(next) }),
        modelChangeValue: next.value,
      });
      void switchModel(next.value);
    };

    window.addEventListener(ROTATE_MODEL_EVENT, handleRotate);
    return () => window.removeEventListener(ROTATE_MODEL_EVENT, handleRotate);
  }, [models, currentModel, appendMessage, t, switchModel]);

  // Models not loaded yet — nothing meaningful to show. The CLI config arrives
  // shortly and fills this in; this is the ONLY case where the tag is hidden.
  if (models.length === 0 || resolvedLabel === null) return null;

  // An unidentified model shows as itself, not as "Default" (issue #217): the
  // tag still always renders, under fallbackModelLabel. The tooltip has room for
  // the whole story, so it says what the model-change line says: on the
  // `default` row, both the choice and the model behind it. That is also what
  // keeps the default row distinguishable from a row the user picked by name,
  // which the chip alone can no longer show.
  const label = resolvedLabel;
  const chip = info ? chipLabel(info) : label;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent(SWITCH_MODEL_EVENT));
  };

  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const rotateHint = isMac ? '⌘⇧.' : 'Ctrl+Shift+.';

  return (
    <Tag
      // The label may be ellipsized, so carry the full model name in the
      // tooltip — that is where a truncated custom name stays readable.
      title={`${label} — ${t('chatInput.modelTag.switchModel', { hint: rotateHint })}`}
      onClick={handleClick}
    >
      {/* Custom catalogs carry long model names, so cap the width and ellipsize
          rather than letting the bottom row grow or wrap (issue #217). The full
          name stays available in the tag's tooltip. */}
      <span className="hidden xs:inline truncate max-w-[12rem]">{chip}</span>
      <span className="inline xs:hidden truncate max-w-[6rem]">{chip.split(' ')[0]}</span>
    </Tag>
  );
}
