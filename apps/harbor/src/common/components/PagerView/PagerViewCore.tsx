import { Atoms } from '@/src/common/theme';
import ExpoPagerView, {
  type PageScrollStateChangedEvent,
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
  type PagerViewRef,
} from '@expo/ui/community/pager-view';
import { useIsFocused } from 'expo-router';
import {
  Children,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import {
  GestureDetector,
  useNativeGesture,
} from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { NavDrawerGestureContext } from '../layout/nav/drawer/lib/nav-drawer-gesture-context';
import { useNavDrawerStore } from '../layout/nav/drawer/hooks/useNavDrawerStore';
import { PageActiveContext } from './PageActiveContext';

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
  const pagerRef = useRef<PagerViewRef>(null);
  // `initialPage` is only read on mount.
  const initialIndex = useRef(activeIndex).current;

  // The page the pager is on. Tab taps drive the pager, swipes drive `active`,
  // and this keeps the two from fighting each other.
  const indexRef = useRef(activeIndex);

  const pagerId = useId();
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const { claimPager, releasePager } = useNavDrawerStore.getState();
    claimPager(pagerId, indexRef.current);
    return () => releasePager(pagerId);
  }, [isFocused, pagerId]);

  useEffect(() => {
    if (indexRef.current === activeIndex) return;
    onLeavePage?.(indexRef.current);
    indexRef.current = activeIndex;
    useNavDrawerStore.getState().setPagerPage(pagerId, activeIndex);
    pagerRef.current?.setPage(activeIndex);
  }, [activeIndex, onLeavePage, pagerId]);

  const waitsForDrawer = useNativeGesture({
    requireToFail: useContext(NavDrawerGestureContext),
  });

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
    useNavDrawerStore.getState().setPagerPage(pagerId, index);
    onSwipeSettled?.();
    const next = values[index];
    if (next !== undefined) onChange(next);
  };

  const onPageScrollStateChanged = (event: PageScrollStateChangedEvent) => {
    if (event.nativeEvent.pageScrollState !== 'dragging') return;
    onLeavePage?.(indexRef.current);
  };

  return (
    <GestureDetector gesture={waitsForDrawer}>
      <ExpoPagerView
        ref={pagerRef}
        style={Atoms.flex_1}
        initialPage={initialIndex}
        onPageScroll={onPageScroll}
        onPageSelected={onPageSelected}
        onPageScrollStateChanged={onPageScrollStateChanged}
      >
        {Children.map(children, (child, index) => (
          <PageActiveContext value={index === activeIndex}>
            {wrapPage(child, index)}
          </PageActiveContext>
        ))}
      </ExpoPagerView>
    </GestureDetector>
  );
}
