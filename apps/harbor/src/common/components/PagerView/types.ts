import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * What the pager hands its header slots. `dragProgress` tracks the pages as
 * a fractional index, so a tab bar can move its indicator with the swipe.
 */
export type PagerViewHeaderState = { dragProgress: SharedValue<number> };

export type PagerViewProps<T extends string> = {
  /** Page order; a value's index is its position in the pager. */
  values: readonly T[];
  active: T;
  /** Called when a tab is selected or a swipe settles on another page. */
  onChange: (value: T) => void;
  /** Rendered above the pages so it stays put while they move. */
  renderTabBar: (state: PagerViewHeaderState) => ReactNode;
  /** One page per value, in the same order. */
  children: ReactNode;
};

export type PagerViewWithHeaderProps<T extends string> = PagerViewProps<T> & {
  /**
   * A header above the tab bar that scrolls away 1:1 with the showing page;
   * the tab bar pins below it. Page offsets are kept aligned so the header
   * never jumps between tabs.
   */
  renderHeader: (state: PagerViewHeaderState) => ReactNode;
  /** Fed the showing page's scroll offset. */
  scrollY?: SharedValue<number>;
  /** Reports the measured header + tab bar height. */
  onHeaderHeightChange?: (height: number) => void;
};
