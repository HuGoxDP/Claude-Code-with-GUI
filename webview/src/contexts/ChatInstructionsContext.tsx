import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSessionContext } from './SessionContext';

/**
 * A saved prompt chosen as the instructions of the conversation that has not
 * started yet (ported from CC GUI's agents, which are saved system prompts).
 *
 * Only a new conversation can take instructions. The backend starts its CLI with
 * `--append-system-prompt-file`, and the CLI keeps the system prompt a session
 * began with: resuming it with other instructions, or none, changes nothing
 * (measured; see writeInstructionsFile in the backend). So the choice lives here
 * only until the first message creates the session, which takes it (take), and
 * from then on the CLI carries it through every restart on its own.
 *
 * Opening an existing session from the empty screen drops the choice, since it
 * was about a new conversation (the same rule as the allow-all draft).
 */
export interface ChatInstructions {
  /** The prompt's library id (its uuid), which is what travels to the backend. */
  id: string;
  /** Shown above the composer while the choice is pending. */
  name: string;
}

interface ChatInstructionsContextValue {
  /** The instructions the next new conversation will start with. */
  draft: ChatInstructions | null;
  setDraft: (instructions: ChatInstructions | null) => void;
  /**
   * Hand over the pending choice to the message that creates the session, and
   * forget it. Called by whoever creates that session, in the same tick as the
   * send, so it reads a ref rather than waiting for a render.
   */
  take: () => ChatInstructions | null;
}

const ChatInstructionsContext = createContext<ChatInstructionsContextValue | null>(null);

export function ChatInstructionsProvider({ children }: { children: ReactNode }) {
  const { currentSessionId } = useSessionContext();
  const [draft, setDraftState] = useState<ChatInstructions | null>(null);
  const draftRef = useRef<ChatInstructions | null>(null);
  const previousSessionIdRef = useRef(currentSessionId);

  const setDraft = useCallback((instructions: ChatInstructions | null) => {
    draftRef.current = instructions;
    setDraftState(instructions);
  }, []);

  // A session appearing on the empty screen ends the draft: a new one took it
  // already, and an existing one opened from the list must not inherit it.
  useEffect(() => {
    const previous = previousSessionIdRef.current;
    previousSessionIdRef.current = currentSessionId;
    if (previous === null && currentSessionId !== null) setDraft(null);
  }, [currentSessionId, setDraft]);

  const take = useCallback((): ChatInstructions | null => {
    const taken = draftRef.current;
    if (taken) setDraft(null);
    return taken;
  }, [setDraft]);

  return (
    <ChatInstructionsContext.Provider value={{ draft, setDraft, take }}>
      {children}
    </ChatInstructionsContext.Provider>
  );
}

/** For code that may run where no provider is mounted (several test setups render the chat stream alone). */
export function useOptionalChatInstructions(): ChatInstructionsContextValue | null {
  return useContext(ChatInstructionsContext);
}
