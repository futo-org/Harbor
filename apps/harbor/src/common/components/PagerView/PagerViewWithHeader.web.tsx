import { Atoms } from '@/src/common/theme';
import { Children, useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { stickyHeaderStyle } from './PagerView.web';
import type { PagerViewWithHeaderProps } from './types';

/**
 * Web pages scroll the document: the header scrolls away with them, like the
 * native collapse, and the tab bar pins to the window below it.
 */
export function PagerViewWithHeader<T extends string>({
  values,
  active,
  onChange: _onChange,
  renderHeader,
  renderTabBar,
  children,
}: PagerViewWithHeaderProps<T>) {
  const activeIndex = Math.max(0, values.indexOf(active));
  const pages = Children.toArray(children);

  // No drag to follow, so the indicator just animates to the selected tab.
  const dragProgress = useSharedValue(activeIndex);
  useEffect(() => {
    dragProgress.value = withTiming(activeIndex, { duration: 150 });
  }, [activeIndex, dragProgress]);

  return (
    <>
      {renderHeader({ dragProgress })}
      <View style={stickyHeaderStyle}>{renderTabBar({ dragProgress })}</View>

      <View style={Atoms.flex_1}>{pages[activeIndex]}</View>
    </>
  );
}
