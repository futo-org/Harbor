import { Atoms } from '@/src/common/theme';
import { Children, useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import RNPagerView, {
  type PageScrollStateChangedNativeEvent,
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import type { SharedValue } from 'react-native-reanimated';

export type PagerViewCoreProps<T extends string> = {
  values: readonly T[];
  active: T;
  onChange: (value: T) => void;
  /** Driven with the swipe as a fractional page index. */
  dragProgress: SharedValue<number>;
  /** The pager is about to move off the given page (swipe start or tab tap). */
  onLeavePage?: (index: number) => void;
  /** A swipe settled on a page the pager was not on. */
  onSwipeSettled?: () => void;
  /** Wraps each page, e.g. in a `ScrollForwarder`. */
  wrapPage: (child: ReactNode, index: number) => ReactNode;
  children: ReactNode;
};

/** The pager mechanics shared by `PagerView` and `PagerViewWithHeader`. */
export function PagerViewCore<T extends string>({
  values,
  active,
  onChange,
  dragProgress,
  onLeavePage,
  onSwipeSettled,
  wrapPage,
  children,
}: PagerViewCoreProps<T>) {
  const activeIndex = Math.max(0, values.indexOf(active));
  const pagerRef = useRef<RNPagerView>(null);
  // `initialPage` is only read on mount.
  const initialIndex = useRef(activeIndex).current;

  // The page the pager is on. Tab taps drive the pager, swipes drive `active`,
  // and this keeps the two from fighting each other.
  const indexRef = useRef(activeIndex);

  useEffect(() => {
    if (indexRef.current === activeIndex) return;
    onLeavePage?.(indexRef.current);
    indexRef.current = activeIndex;
    pagerRef.current?.setPage(activeIndex);
  }, [activeIndex, onLeavePage]);

  const hasScrollEvents = useRef(false);

  const onPageScroll = (event: PagerViewOnPageScrollEvent) => {
    hasScrollEvents.current = true;
    const { position, offset } = event.nativeEvent;
    dragProgress.value = position + offset;
  };

  const onPageSelected = (event: PagerViewOnPageSelectedEvent) => {
    const index = event.nativeEvent.position;
    if (!hasScrollEvents.current) dragProgress.value = index;
    if (index === indexRef.current) return;
    indexRef.current = index;
    onSwipeSettled?.();
    const next = values[index];
    if (next !== undefined) onChange(next);
  };

  const onPageScrollStateChanged = (
    event: PageScrollStateChangedNativeEvent,
  ) => {
    if (event.nativeEvent.pageScrollState !== 'dragging') return;
    onLeavePage?.(indexRef.current);
  };

  return (
    <RNPagerView
      ref={pagerRef}
      style={Atoms.flex_1}
      initialPage={initialIndex}
      onPageScroll={onPageScroll}
      onPageSelected={onPageSelected}
      onPageScrollStateChanged={onPageScrollStateChanged}
    >
      {Children.map(children, (child, index) => (
        // Each page needs a real host view; flattening would remove a bare one.
        <View collapsable={false}>{wrapPage(child, index)}</View>
      ))}
    </RNPagerView>
  );
}
