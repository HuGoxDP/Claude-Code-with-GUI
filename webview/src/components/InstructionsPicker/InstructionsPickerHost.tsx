import { useEffect, useState } from 'react';
import { usePromptStore } from '../PromptLibraryModal/usePromptStore';
import { useOptionalChatInstructions } from '@/contexts/ChatInstructionsContext';
import { OPEN_PROMPT_LIBRARY_EVENT } from '@/commandPalette/sections/context/items';
import { InstructionsPicker, OPEN_INSTRUCTIONS_PICKER_EVENT } from './index';

/**
 * Opens the picker on request and puts the choice in the chat's draft. The
 * prompts are read only while it is open, so a chat that never asks pays
 * nothing for it.
 */
export function InstructionsPickerHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_INSTRUCTIONS_PICKER_EVENT, handler);
    return () => window.removeEventListener(OPEN_INSTRUCTIONS_PICKER_EVENT, handler);
  }, []);

  return open ? <OpenPicker onClose={() => setOpen(false)} /> : null;
}

function OpenPicker({ onClose }: { onClose: () => void }) {
  const store = usePromptStore();
  const instructions = useOptionalChatInstructions();

  return (
    <InstructionsPicker
      prompts={[...store.projectPrompts, ...store.globalPrompts]}
      loading={store.loading}
      error={store.error}
      selectedId={instructions?.draft?.id ?? null}
      onPick={(prompt) => {
        instructions?.setDraft({ id: prompt.id, name: prompt.name });
        onClose();
      }}
      onClear={() => {
        instructions?.setDraft(null);
        onClose();
      }}
      onOpenLibrary={() => {
        onClose();
        window.dispatchEvent(new CustomEvent(OPEN_PROMPT_LIBRARY_EVENT));
      }}
      onCancel={onClose}
    />
  );
}
