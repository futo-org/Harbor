import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

/**
 * Forces vertical scrolling to scroll horizontally.
 *
 * This is a no-op on mobile since finger swiping is used for scrolling,
 * and this already provides reliable horizontal scrolling.
 */
export function useHorizontalWheelScroll(
  _ref: RefObject<ScrollView | null>,
): void {}
