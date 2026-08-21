import { Atoms, ZIndex } from '@/src/common/theme';
import { Children, useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import type { PagerViewProps } from './types';

// Web scrolls the document, so the pager's header pins to the window.
export const stickyHeaderStyle: ViewStyle[] = [
  Atoms.sticky,
  { top: 0, zIndex: ZIndex.raised },
];

/**
 * `@expo/ui`'s pager is native-only, and web has no swipe anyway: pages switch
 * instantly. The tab bar pins to the window instead of hiding on scroll.
 */
export function PagerView<T extends string>({
  values,
  active,
  onChange: _onChange,
  renderTabBar,
  children,
}: PagerViewProps<T>) {
  const activeIndex = Math.max(0, values.indexOf(active));
  const pages = Children.toArray(children);

  // No drag to follow, so the indicator just animates to the selected tab.
  const dragProgress = useSharedValue(activeIndex);
  useEffect(() => {
    dragProgress.value = withTiming(activeIndex, { duration: 150 });
  }, [activeIndex, dragProgress]);

  return (
    <>
      <View style={stickyHeaderStyle}>{renderTabBar({ dragProgress })}</View>

      <View style={Atoms.flex_1}>{pages[activeIndex]}</View>
    </>
  );
}
