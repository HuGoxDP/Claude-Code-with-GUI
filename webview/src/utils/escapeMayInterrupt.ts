/**
 * Whether an Escape keypress may be read as "stop the running response".
 *
 * Escape means "cancel what I am doing here", and what the user is doing is
 * usually closing a panel or a dialog. The key only counts as a request to stop
 * the stream when nothing else has used it first: an overlay that handled it has
 * marked it as handled, and the schedule popover owns its own Escape.
 */
export function escapeMayInterrupt(
  event: { key: string; defaultPrevented: boolean },
  scheduleSendPopoverOpen: boolean,
): boolean {
  if (event.key !== 'Escape') return false;
  if (scheduleSendPopoverOpen) return false;
  return !event.defaultPrevented;
}
