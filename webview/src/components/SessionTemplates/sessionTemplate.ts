import { INPUT_MODES, isValidInputMode, type InputMode } from '@/types/chatInput';
import { DEFAULT_MODEL_ALIAS, toDisplayLabel } from '@/types/models';
import { getEffortDef } from '@/types/effort';

/** Fired to ask the chat page to open "Save as template". */
export const OPEN_SAVE_TEMPLATE_EVENT = 'chat:open-save-template';
/** Fired to ask the chat page to open "New chat from template". */
export const OPEN_TEMPLATE_PICKER_EVENT = 'chat:open-template-picker';

/** The effort a template stores for the top step, xhigh with standing workflows. */
export const ULTRACODE_TEMPLATE_EFFORT = 'ultracode';

/**
 * A saved session template as the backend sends it (GET_SESSION_TEMPLATES):
 * the choices a new conversation starts with, ported from CC GUI. A null choice
 * is one the template leaves as it is.
 */
export interface SessionTemplate {
  name: string;
  /** The model id or alias, as the model picker holds it. */
  model: string | null;
  /** The composer's mode. */
  inputMode: string | null;
  /** The effort level as the CLI's `effortLevel` spells it, `auto`, or `ultracode`. */
  effort: string | null;
  updatedAt: number;
}

/** The choices of the chat now, in the form a template stores them. */
export function choicesOf(model: string, inputMode: InputMode, effort: string, ultracode: boolean) {
  return { model, inputMode, effort: ultracode ? ULTRACODE_TEMPLATE_EFFORT : effort };
}

/** What each choice of a template reads as, for a one-line summary. Null where it sets nothing. */
export function templateLabels(template: Pick<SessionTemplate, 'model' | 'inputMode' | 'effort'>): {
  model: string | null;
  inputMode: string | null;
  effort: string | null;
} {
  const { model, inputMode, effort } = template;
  return {
    model: model ? (model === DEFAULT_MODEL_ALIAS ? 'Default' : toDisplayLabel(model)) : null,
    inputMode: inputMode ? (isValidInputMode(inputMode) ? INPUT_MODES[inputMode].label : inputMode) : null,
    effort: effort
      ? effort === ULTRACODE_TEMPLATE_EFFORT
        ? 'Ultracode'
        : getEffortDef(effort, [effort]).label
      : null,
  };
}

/** "Opus · Plan mode · High", leaving out what the template does not set. */
export function templateSummary(template: Pick<SessionTemplate, 'model' | 'inputMode' | 'effort'>): string {
  const labels = templateLabels(template);
  return [labels.model, labels.inputMode, labels.effort].filter(Boolean).join(' · ');
}

/** Where applying a template writes each choice. */
export interface TemplateTargets {
  switchModel: (model: string) => Promise<void> | void;
  setInputMode: (mode: InputMode) => void;
  /** The modes this chat offers; a template's mode outside them is skipped. */
  availableModes: readonly InputMode[];
  setEffort: (effort: string) => Promise<void> | void;
}

/**
 * Put a template's choices into the chat: the model, then the mode, then the
 * effort (the effort's levels belong to the model, so it goes after it). A
 * choice the template does not set is left as it is, and a mode this chat does
 * not offer is skipped rather than forced.
 */
export async function applySessionTemplate(template: SessionTemplate, targets: TemplateTargets): Promise<void> {
  if (template.model) await targets.switchModel(template.model);
  if (template.inputMode && isValidInputMode(template.inputMode) && targets.availableModes.includes(template.inputMode)) {
    targets.setInputMode(template.inputMode);
  }
  if (template.effort) await targets.setEffort(template.effort);
}
