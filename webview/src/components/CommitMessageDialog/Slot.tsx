import { useEffect, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { CommitMessageDialog, OPEN_COMMIT_MESSAGE_EVENT } from './index';

/**
 * Mounts the commit message dialog when the palette asks for it, for the project
 * the chat is in. Each opening writes a fresh message: the changes may well have
 * moved on since the last one.
 */
export function CommitMessageDialogSlot() {
  const [open, setOpen] = useState(false);
  const { send } = useBridgeContext();
  const { workingDirectory } = useSessionContext();
  const model = useCurrentModel();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_COMMIT_MESSAGE_EVENT, handler);
    return () => window.removeEventListener(OPEN_COMMIT_MESSAGE_EVENT, handler);
  }, []);

  if (!open) return null;
  return (
    <CommitMessageDialog
      send={send}
      workingDirectory={workingDirectory}
      model={model}
      onClose={() => setOpen(false)}
    />
  );
}
