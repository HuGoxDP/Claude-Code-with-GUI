import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useBridge } from '@/hooks/useBridge';
import { MessageType } from '@/shared';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useEffort } from '@/hooks/useEffort';
import { useModelSwitch } from '@/hooks/useModelSwitch';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { EFFORT_AUTO, ULTRACODE_EFFORT } from '@/types/effort';
import { startNewConversation } from '@/commandPalette/sections/startNewConversation';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { TemplatePicker } from './TemplatePicker';
import {
  OPEN_SAVE_TEMPLATE_EVENT,
  OPEN_TEMPLATE_PICKER_EVENT,
  ULTRACODE_TEMPLATE_EFFORT,
  applySessionTemplate,
  choicesOf,
  type SessionTemplate,
} from './sessionTemplate';

interface TemplatesResponse {
  status: string;
  templates?: SessionTemplate[];
}

/**
 * Opens "Save as template" and "New chat from template" when the slash panel
 * asks for them. The templates are read only while one of them is open.
 */
export function SessionTemplatesHost() {
  const [open, setOpen] = useState<'save' | 'pick' | null>(null);

  useEffect(() => {
    const save = () => setOpen('save');
    const pick = () => setOpen('pick');
    window.addEventListener(OPEN_SAVE_TEMPLATE_EVENT, save);
    window.addEventListener(OPEN_TEMPLATE_PICKER_EVENT, pick);
    return () => {
      window.removeEventListener(OPEN_SAVE_TEMPLATE_EVENT, save);
      window.removeEventListener(OPEN_TEMPLATE_PICKER_EVENT, pick);
    };
  }, []);

  const close = useCallback(() => setOpen(null), []);
  if (open === 'save') return <SaveHost onClose={close} />;
  if (open === 'pick') return <PickHost onClose={close} />;
  return null;
}

/** The saved templates, read once when a dialog opens and replaced by each answer that carries the list. */
function useTemplates() {
  const { send } = useBridge();
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    send<TemplatesResponse>(MessageType.GET_SESSION_TEMPLATES, {})
      .then((res) => {
        if (!live) return;
        if (res.status === 'ok') setTemplates(res.templates ?? []);
        else setFailed(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [send]);

  return { templates, setTemplates, loading, failed, send };
}

function SaveHost({ onClose }: { onClose: () => void }) {
  const { templates, setTemplates, send } = useTemplates();
  const model = useCurrentModel();
  const { inputMode } = useSessionContext();
  const effort = useEffort();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const choices = choicesOf(model, inputMode, effort.current, effort.ultracodeEnabled);

  return (
    <SaveTemplateDialog
      choices={choices}
      existingNames={templates.map((template) => template.name)}
      saving={saving}
      failed={failed}
      onSave={async (name) => {
        setSaving(true);
        try {
          const res = await send<TemplatesResponse>(MessageType.SAVE_SESSION_TEMPLATE, { name, ...choices });
          if (res.templates) setTemplates(res.templates);
          if (res.status === 'ok') {
            onClose();
            return;
          }
          setFailed(true);
        } catch {
          setFailed(true);
        } finally {
          setSaving(false);
        }
      }}
      onCancel={onClose}
    />
  );
}

function PickHost({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('chat');
  const { templates, setTemplates, loading, failed, send } = useTemplates();
  const chatStream = useChatStreamContext();
  const session = useSessionContext();
  const { settings: claudeSettings, updateSetting } = useClaudeSettings();
  const switchModel = useModelSwitch();
  const { confirmDialog, confirm } = useConfirmDialog();
  // While asking whether to leave the conversation, the picker steps aside for
  // the question but stays mounted, since the question is rendered from here.
  const [applying, setApplying] = useState(false);

  // The same two writes the effort slider makes (useEffort), straight to the
  // stored setting: the template's model is switched first, and the slider's
  // own setter still knows only the old model's levels.
  const setEffort = async (value: string) => {
    if (value === ULTRACODE_TEMPLATE_EFFORT) {
      await updateSetting('effortLevel', ULTRACODE_EFFORT);
      await updateSetting('ultracode', true);
      return;
    }
    if (claudeSettings.ultracode === true) await updateSetting('ultracode', null);
    await updateSetting('effortLevel', value === EFFORT_AUTO ? null : value);
  };

  const pick = async (template: SessionTemplate) => {
    setApplying(true);
    const started = session.currentSessionId !== null || chatStream.messages.length > 0;
    if (started) {
      const left = await startNewConversation({
        chatStream: {
          messages: chatStream.messages,
          isStreaming: chatStream.isStreaming,
          stop: chatStream.stop,
          resetForSessionSwitch: chatStream.resetForSessionSwitch,
        },
        session: { currentSessionId: session.currentSessionId, resetToNewSession: session.resetToNewSession },
        ui: { confirm },
      });
      if (!left) {
        setApplying(false);
        return;
      }
    }
    await applySessionTemplate(template, {
      switchModel,
      setInputMode: session.setInputMode,
      availableModes: session.availableModes,
      setEffort,
    });
    onClose();
  };

  const remove = async (template: SessionTemplate) => {
    const yes = await confirm({
      title: t('sessionTemplates.deleteTitle'),
      message: t('sessionTemplates.deleteMessage', { name: template.name }),
      confirmLabel: t('sessionTemplates.deleteConfirm'),
      cancelLabel: t('sessionTemplates.cancel'),
    });
    if (!yes) return;
    const res = await send<TemplatesResponse>(MessageType.DELETE_SESSION_TEMPLATE, { name: template.name });
    if (res.templates) setTemplates(res.templates);
  };

  return (
    <>
      {!applying && (
        <TemplatePicker
          templates={templates}
          loading={loading}
          failed={failed}
          onPick={(template) => void pick(template)}
          onDelete={(template) => void remove(template)}
          onCancel={onClose}
        />
      )}
      {confirmDialog}
    </>
  );
}
