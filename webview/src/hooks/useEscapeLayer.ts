import { useEffect, useRef } from 'react';

/**
 * The overlays that are open right now, oldest first. Only the last one answers
 * Escape, which is what makes "Escape closes the top-most thing" true when a
 * confirm dialog opens over a modal that opened over the composer.
 */
const layers: symbol[] = [];

/**
 * Makes an overlay own the Escape key for as long as it is open.
 *
 * Escape means "cancel what I am doing here", and the chat composer also reads it
 * as "stop the stream". An overlay that merely closes itself on Escape lets the
 * same keypress reach the composer, which then interrupts a running response the
 * user never meant to touch. So the top-most layer takes the key in the capture
 * phase and stops it there: nothing below it, the composer included, sees it.
 *
 * [onEscape] answers true when it used the key. Answering false hands the key to
 * whatever is inside the overlay (a name being typed, for one), which cancels
 * itself and stops the key on its own.
 *
 * The listener is on `window` in the capture phase, so it runs before the React
 * handlers and before every bubble-phase listener on the page.
 */
export function useEscapeLayer(onEscape: (event: KeyboardEvent) => boolean, active = true): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const layer = Symbol('escape-layer');
    layers.push(layer);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (layers[layers.length - 1] !== layer) return;
      if (!handler.current(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [active]);
}
