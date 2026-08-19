import { Atoms } from '@/src/common/theme';
import ExpoPagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
  type PagerViewRef,
} from '@expo/ui/community/pager-view';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { PagerViewProps } from './types';

/**
 * A tab bar and the pages behind it, one child per value in the same order.
 * Tapping a tab animates to its page, swiping selects the tab it lands on, and
 * `dragProgress` follows the swipe for the tab bar's indicator.
 *
 * Which pages may load is the screen's business: it knows the active tab, so it
 * tells each page whether it is the one showing.
 */
export function PagerView<T extends string>({
  values,
  active,
  onChange,
  renderTabBar,
  children,
}: PagerViewProps<T>) {
  const activeIndex = Math.max(0, values.indexOf(active));
  const pagerRef = useRef<PagerViewRef>(null);
  // `initialPage` is only read on mount.
  const initialIndex = useRef(activeIndex).current;

  const dragProgress = useSharedValue(activeIndex);

  // The page the pager is on. Tab taps drive the pager, swipes drive `active`,
  // and this keeps the two from fighting each other.
  const indexRef = useRef(activeIndex);

  useEffect(() => {
    if (indexRef.current === activeIndex) return;
    indexRef.current = activeIndex;
    pagerRef.current?.setPage(activeIndex);
  }, [activeIndex]);

  const onPageScroll = (event: PagerViewOnPageScrollEvent) => {
    const { position, offset } = event.nativeEvent;
    dragProgress.value = position + offset;
  };

  const onPageSelected = (event: PagerViewOnPageSelectedEvent) => {
    const index = event.nativeEvent.position;
    // Lands the indicator exactly, and is all it gets on iOS below 18, which
    // reports no scroll events.
    dragProgress.value = index;
    if (index === indexRef.current) return;
    indexRef.current = index;
    const next = values[index];
    if (next !== undefined) onChange(next);
  };

  return (
    <View style={Atoms.flex_1}>
      {renderTabBar({ dragProgress })}

      <ExpoPagerView
        ref={pagerRef}
        style={Atoms.flex_1}
        initialPage={initialIndex}
        onPageScroll={onPageScroll}
        onPageSelected={onPageSelected}
      >
        {children}
      </ExpoPagerView>
    </View>
  );
}
