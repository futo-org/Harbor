import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type PagerViewProps<T extends string> = {
  /** Page order; a value's index is its position in the pager. */
  values: readonly T[];
  active: T;
  /** Called when a tab is selected or a swipe settles on another page. */
  onChange: (value: T) => void;
  /**
   * Rendered above the pages so it stays put while they move. `dragProgress`
   * tracks the pages as a fractional index, so a tab bar can move its indicator
   * with the swipe.
   */
  renderTabBar: (state: { dragProgress: SharedValue<number> }) => ReactNode;
  /** One page per value, in the same order. */
  children: ReactNode;
};
