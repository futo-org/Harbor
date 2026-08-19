import { Atoms } from '@/src/common/theme';
import { Children, useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import type { PagerViewWithHeaderProps } from './types';

/**
 * Web pages scroll the document, taking the header and tab bar with them, so
 * both just sit in flow above the selected page.
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
      {renderTabBar({ dragProgress })}

      <View style={Atoms.flex_1}>{pages[activeIndex]}</View>
    </>
  );
}
