import { PointerSensor } from '@dnd-kit/react';
import { isPromptDragBlocked } from './promptDrag';

/**
 * How a press turns into a drag on a prompt row, in the library modal and in the
 * `!!` panel alike.
 *
 * A row's body is a button, and the drag layer by default refuses to start a drag
 * from any button inside the element being dragged. That default is what would
 * make "the whole row is the handle" impossible, so it is replaced with the one
 * exception that matters: the controls marked as no-drag. The distance a press
 * has to travel before it becomes a drag is the library's own, which is what
 * keeps a plain click a click.
 *
 * One definition rather than one per screen, so the two screens cannot start to
 * disagree about when a press is a drag.
 */
export const PROMPT_SENSORS = [
  PointerSensor.configure({
    preventActivation: (event) => isPromptDragBlocked(event.target),
  }),
];
