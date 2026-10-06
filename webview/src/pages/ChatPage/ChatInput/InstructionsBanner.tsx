import { InputBanner } from '../InputBanner';
import { useTranslation } from '@/i18n';
import { useOptionalChatInstructions } from '@/contexts/ChatInstructionsContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { OPEN_INSTRUCTIONS_PICKER_EVENT } from '@/components/InstructionsPicker';

/**
 * Says which saved prompt the conversation about to start will run with, above
 * the composer of an empty chat. Shown only there: once the first message has
 * gone, the instructions are the session's and cannot change (the CLI keeps the
 * system prompt a session began with).
 */
export function InstructionsBanner() {
  const { t } = useTranslation('chat');
  const instructions = useOptionalChatInstructions();
  const { currentSessionId } = useSessionContext();
  const draft = instructions?.draft;
  if (!draft || currentSessionId !== null) return null;

  return (
    <InputBanner
      message={
        <span>
          {t('instructions.banner')}{' '}
          <span className="font-medium">{draft.name}</span>
        </span>
      }
      actions={
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_INSTRUCTIONS_PICKER_EVENT))}
          className="text-text-link hover:underline"
        >
          {t('instructions.change')}
        </button>
      }
      onClose={() => instructions?.setDraft(null)}
    />
  );
}
