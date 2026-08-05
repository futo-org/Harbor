import { useEffect, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

/**
 * Fallback conversion for when the wheel events don't support pixel deltas.
 */
const PIXELS_PER_WHEEL_LINE = 40;

/**
 * Get the scroll distance from this event in pixels.
 * Browsers may report deltas in other forms, so we normalize here.
 * `pageWidth` specifies how far to scroll when we are requested to
 * scroll in "pages."
 * Returns undefined when we should not handle this delta.
 */
function readDelta(event: WheelEvent, pageWidth: number): number | undefined {
  // We must read these fields before reading `deltaMode`, because this forces
  // Firefox to convert values to pixels internally.
  const { deltaX, deltaY } = event;

  // Already-horizontal scroll events should be left alone.
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return undefined;

  switch (event.deltaMode) {
    case event.DOM_DELTA_LINE:
      return deltaY * PIXELS_PER_WHEEL_LINE;
    case event.DOM_DELTA_PAGE:
      return deltaY * pageWidth;
    default:
      return deltaY;
  }
}

/**
 * Forces vertical scrolling to scroll horizontally.
 *
 * This is useful for components that only need to scroll horizontally,
 * but may be difficult to scroll this way since many mice can only
 * scroll up or down.
 */
export function useHorizontalWheelScroll(
  ref: RefObject<ScrollView | null>,
): void {
  useEffect(() => {
    // `getScrollableNode()` returns `any` to remain compatible with native platforms.
    // For the web, we can assume that it returns an `HTMLElement`.
    const node = ref.current?.getScrollableNode() as HTMLElement | undefined;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const max = node.scrollWidth - node.clientWidth;
      if (max <= 0) return;

      const delta = readDelta(event, node.clientWidth * 0.6);
      if (!delta) return;

      const current = node.scrollLeft;
      const next = Math.min(max, Math.max(0, current + delta));
      if (next === current) return;

      node.scrollLeft = next;
      event.preventDefault();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [ref]);
}
