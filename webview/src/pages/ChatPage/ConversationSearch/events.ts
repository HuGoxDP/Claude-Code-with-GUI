import { hasCmdOrCtrl } from '@/hooks/useZoomControls';

/**
 * Window events that drive the in-chat search bar, the same split the help
 * modal uses: the shortcut and the palette item announce what the user asked
 * for, and the bar, which owns its own state, decides what that means.
 */

/** Cmd/Ctrl+F : open the bar, or put the cursor back in it when it is already open. */
export const OPEN_CONVERSATION_SEARCH_EVENT = 'open-conversation-search';

/**
 * Cmd+F on macOS, Ctrl+F elsewhere, nothing else held: Shift+F is the IDE's
 * Find in Files and stays the IDE's. Matched on the typed character or the
 * physical key, so a layout that moves F still reaches it.
 */
export function isConversationSearchShortcut(e: KeyboardEvent): boolean {
  return (
    hasCmdOrCtrl(e) &&
    !e.shiftKey &&
    !e.altKey &&
    !e.repeat &&
    (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')
  );
}
