import { TABS_HEIGHT } from '@/src/common/components/metrics';
import {
  type ForwardedScrollable,
  ScrollForwarder,
} from '@/src/common/components/ScrollForwarder';
import { Atoms, ZIndex } from '@/src/common/theme';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PagerViewCore } from './PagerViewCore';
import type { PagerViewWithHeaderProps } from './types';

/**
 * A `PagerView` with a collapsing header: the header scrolls away 1:1 with
 * the showing page as if it were part of its content, the tab bar pinning
 * below it. Before another page shows, its offset is aligned so the header
 * never jumps between tabs.
 */
export function PagerViewWithHeader<T extends string>({
  values,
  active,
  onChange,
  renderHeader,
  renderTabBar,
  scrollY: providedScrollY,
  onHeaderHeightChange,
  children,
}: PagerViewWithHeaderProps<T>) {
  const activeIndex = Math.max(0, values.indexOf(active));
  const dragProgress = useSharedValue(activeIndex);

  // The showing page's offset; the header rides on it.
  const internalScrollY = useSharedValue(0);
  const scrollY = providedScrollY ?? internalScrollY;
  const onActivePageScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Measured separately: only the header's own height collapses.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHeightShared = useSharedValue(0);
  const [tabBarHeight, setTabBarHeight] = useState(TABS_HEIGHT);
  const onHeaderLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    // A loading header measures 0 until it has content.
    if (!next) return;
    headerHeightShared.value = next;
    setHeaderHeight((prev) => (prev === next ? prev : next));
  };
  const onTabBarLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next) setTabBarHeight((prev) => (prev === next ? prev : next));
  };
  useEffect(() => {
    onHeaderHeightChange?.(headerHeight + tabBarHeight);
  }, [headerHeight, tabBarHeight, onHeaderHeightChange]);

  const collapseStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -Math.min(scrollY.value, headerHeightShared.value) },
    ],
  }));

  // Registered page lists; the callbacks stay stable so lists don't
  // re-register every render.
  const pageLists = useRef<(ForwardedScrollable | null)[]>([]);
  const registrars = useRef<((list: ForwardedScrollable | null) => void)[]>([]);
  const registerAt = useCallback((index: number) => {
    registrars.current[index] ??= (list) => {
      pageLists.current[index] = list;
    };
    return registrars.current[index];
  }, []);

  // The other pages take the offset that keeps the header put, so a swipe
  // reveals them already lined up.
  const onLeavePage = useCallback(
    (index: number) => {
      const offset = Math.min(scrollY.value, headerHeightShared.value);
      pageLists.current.forEach((list, i) => {
        if (i !== index) list?.scrollToOffset(offset);
      });
    },
    [scrollY, headerHeightShared],
  );

  // A page too short to hold the aligned offset clamps to its own end, so
  // ease the header out to wherever the landing page actually sits.
  useEffect(() => {
    const offset = pageLists.current[activeIndex]?.getScrollOffset() ?? 0;
    if (offset < scrollY.value) {
      scrollY.value = withTiming(offset, { duration: 180 });
    }
  }, [activeIndex, scrollY]);

  const wrapPage = useCallback(
    (child: ReactNode, index: number) => (
      <ScrollForwarder
        // Only the showing page's scroll moves the header.
        onScroll={index === activeIndex ? onActivePageScroll : undefined}
        contentPaddingTop={headerHeight + tabBarHeight}
        register={registerAt(index)}
      >
        {child}
      </ScrollForwarder>
    ),
    [activeIndex, onActivePageScroll, headerHeight, tabBarHeight, registerAt],
  );

  return (
    <View style={Atoms.flex_1}>
      <Animated.View
        style={[
          Atoms.absolute,
          { top: 0, left: 0, right: 0, zIndex: ZIndex.raised },
          collapseStyle,
        ]}
      >
        <View onLayout={onHeaderLayout}>{renderHeader({ dragProgress })}</View>
        <View onLayout={onTabBarLayout}>{renderTabBar({ dragProgress })}</View>
      </Animated.View>
      <PagerViewCore
        values={values}
        active={active}
        onChange={onChange}
        dragProgress={dragProgress}
        onLeavePage={onLeavePage}
        wrapPage={wrapPage}
      >
        {children}
      </PagerViewCore>
    </View>
  );
}
