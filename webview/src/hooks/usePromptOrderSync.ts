import { useEffect } from 'react';
import { MessageType } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { setPromptOrderSink } from '@/utils/promptOrderStore';

/**
 * Saves the orders the user makes to the backend, for as long as a screen that
 * can make them is mounted.
 *
 * The order store changes first so the screen moves at once; this is where the
 * change is sent. A failed save is logged and not retried: the next read from the
 * backend brings the screen back to the order that is actually saved.
 *
 * [workingDirectory] is the project the screen is showing, which a project order
 * is saved against. Both the library modal and the `!!` panel call this. Whichever registered last
 * is the one that saves, and a screen going away only unregisters itself.
 */
export function usePromptOrderSync(workingDirectory: string | null | undefined): void {
  const bridge = useBridgeContext();

  useEffect(() => {
    const report = (what: string) => (err: unknown) =>
      console.error(`[prompt-order] saving the ${what} failed`, err);

    return setPromptOrderSink({
      persistPromptOrder: (scope, ids, categoryId) => {
        // A project order cannot be saved without a project, and has none to show.
        if (scope === 'project' && !workingDirectory) return;
        void Promise.resolve(
          bridge.send(MessageType.REORDER_PROMPTS, {
            scope,
            ...(scope === 'project' ? { workingDir: workingDirectory } : {}),
            ids,
            ...(categoryId === undefined ? {} : { categoryId }),
          }),
        ).catch(report('prompt order'));
      },
      persistCategoryOrder: (ids) => {
        void Promise.resolve(bridge.send(MessageType.REORDER_PROMPT_CATEGORIES, { ids })).catch(
          report('category order'),
        );
      },
    });
  }, [bridge, workingDirectory]);
}
