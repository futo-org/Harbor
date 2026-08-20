import {
  HidingHeaderStack,
  useHidingHeader,
} from '@/src/common/components/HidingHeader';
import { TABS_HEIGHT, TOPBAR_HEIGHT } from '@/src/common/components/metrics';
import { ScrollForwarder } from '@/src/common/components/ScrollForwarder';
import { useCallback, type ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { PagerViewCore } from './PagerViewCore';
import type { PagerViewProps } from './types';

/**
 * A tab bar and the pages behind it, one child per value in the same order.
 * Tapping a tab animates to its page, swiping selects the tab it lands on,
 * and the bar hides as the showing page scrolls down.
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
  const dragProgress = useSharedValue(activeIndex);

  // Seeded with the usual topbar + tabs height until the first layout lands.
  const {
    onScroll,
    onHeaderLayout,
    translateStyle,
    headerHeight,
    contentPaddingTop,
    reveal,
  } = useHidingHeader(TOPBAR_HEIGHT + TABS_HEIGHT);

  const wrapPage = useCallback(
    (child: ReactNode, index: number) => (
      <ScrollForwarder
        // Only the showing page's scroll moves the bar.
        onScroll={index === activeIndex ? onScroll : undefined}
        contentPaddingTop={contentPaddingTop}
      >
        {child}
      </ScrollForwarder>
    ),
    [activeIndex, onScroll, contentPaddingTop],
  );

  return (
    <HidingHeaderStack
      header={renderTabBar({ dragProgress })}
      headerHeight={headerHeight}
      onHeaderLayout={onHeaderLayout}
      style={translateStyle}
    >
      <PagerViewCore
        values={values}
        active={active}
        onChange={onChange}
        dragProgress={dragProgress}
        // A swipe landing on another page brings a hidden tab bar back.
        onSwipeSettled={reveal}
        wrapPage={wrapPage}
      >
        {children}
      </PagerViewCore>
    </HidingHeaderStack>
  );
}
