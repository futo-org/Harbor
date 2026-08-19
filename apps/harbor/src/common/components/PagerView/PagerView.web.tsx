import { Atoms } from '@/src/common/theme';
import { Children, useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import type { PagerViewProps } from './types';

/**
 * `@expo/ui`'s pager is native-only, and web has no swipe anyway: pages switch
 * instantly.
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
      {renderTabBar({ dragProgress })}

      <View style={Atoms.flex_1}>{pages[activeIndex]}</View>
    </>
  );
}
