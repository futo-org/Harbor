import { Atoms, ZIndex } from '@/src/common/theme';
import { isIOS } from '@/src/common/util/platform';
import React, {
  isValidElement,
  useCallback,
  useState,
  type ReactNode,
} from 'react';
import {
  type LayoutChangeEvent,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
  type StyleProps,
} from 'react-native-reanimated';

// The header stays put until the user has scrolled this far.
const HEADER_HIDE_THRESHOLD = 50;
const HEADER_SETTLE_MS = 180;

/** iOS draws its refresh control at the scrollable's top edge, so the header
 *  can't float over it. Android can, and must — transforming a scrolling list
 *  there stutters — and offsets the control with `progressViewOffset`. */
const SLIDES_TOGETHER = isIOS;

/** A header that slides away as the scrollable below it scrolls down.
 *
 *  `initialHeight` is used until the header reports its own. Feed the results to
 *  `HidingHeaderStack` and pad the content by `contentPaddingTop`. `scrollY`, if
 *  given, tracks the scroll offset. */
export function useHidingHeader(
  initialHeight = 0,
  scrollY?: SharedValue<number>,
) {
  const lastScrollY = useSharedValue(0);
  const headerTranslate = useSharedValue(0);
  const headerHeightShared = useSharedValue(initialHeight);
  const isDragging = useSharedValue(false);
  const isMomentum = useSharedValue(false);
  const [headerHeight, setHeaderHeight] = useState(initialHeight);

  // Memoised to keep the scroll handler's closure stable.
  const settleHeader = useCallback(() => {
    'worklet';
    const h = headerHeightShared.value;
    if (h <= 0) return;
    headerTranslate.value = withTiming(
      headerTranslate.value < -h / 2 ? -h : 0,
      { duration: HEADER_SETTLE_MS },
    );
  }, [headerHeightShared, headerTranslate]);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (event) => {
      isDragging.value = true;
      // iOS skips `onMomentumEnd` on interrupted scrolls.
      isMomentum.value = false;
      // Measure this gesture from here, not from whatever moved the list last.
      lastScrollY.value = event.contentOffset.y;
    },
    onEndDrag: () => {
      isDragging.value = false;
      settleHeader();
    },
    onMomentumBegin: () => {
      isMomentum.value = true;
    },
    onMomentumEnd: () => {
      isMomentum.value = false;
      settleHeader();
    },
    onScroll: (event) => {
      const h = headerHeightShared.value;
      const currentY = event.contentOffset.y;
      if (scrollY) scrollY.value = currentY;

      if (currentY <= HEADER_HIDE_THRESHOLD) {
        headerTranslate.value = 0;
      } else if (isDragging.value) {
        // Only a finger moves the header; FlashList rewrites `contentOffset`
        // itself when rows above the anchor resize.
        const delta = currentY - lastScrollY.value;
        headerTranslate.value = Math.min(
          0,
          Math.max(-h, headerTranslate.value - delta),
        );
      }
      lastScrollY.value = currentY;
    },
  });

  const translateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslate.value }],
  }));

  const onHeaderLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    // A remounting header measures 0 for a frame.
    if (!next) return;
    headerHeightShared.value = next;
    if (next !== headerHeight) setHeaderHeight(next);
  };

  /** Bring a hidden header back, e.g. when the page under it changes. */
  const reveal = useCallback(() => {
    headerTranslate.value = withTiming(0, { duration: HEADER_SETTLE_MS });
  }, [headerTranslate]);

  return {
    onScroll,
    onHeaderLayout,
    translateStyle,
    headerHeight,
    contentPaddingTop: SLIDES_TOGETHER ? 0 : headerHeight,
    reveal,
  };
}

/** Lays out a hiding header above a scrollable. `SLIDES_TOGETHER` picks which
 *  of the two moves. */
export function HidingHeaderStack({
  header,
  headerHeight,
  onHeaderLayout,
  style,
  children,
}: {
  header: ReactNode;
  headerHeight: number;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  style: StyleProps;
  children: ReactNode;
}) {
  return (
    <View style={[Atoms.flex_1, SLIDES_TOGETHER && Atoms.overflow_hidden]}>
      <Animated.View style={[Atoms.flex_1, SLIDES_TOGETHER && style]}>
        {header ? (
          <Animated.View
            onLayout={onHeaderLayout}
            style={
              SLIDES_TOGETHER
                ? undefined
                : [Atoms.absolute, styles.floatingHeader, style]
            }
          >
            {header}
          </Animated.View>
        ) : null}

        {/* Hangs past the bottom, to cover the gap sliding leaves. */}
        <View
          style={[
            Atoms.flex_1,
            SLIDES_TOGETHER && { marginBottom: -headerHeight },
          ]}
        >
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

type ReactNodeOrComponent =
  | React.ReactElement
  | React.ComponentType
  | null
  | undefined;

/** Render a header given either an element or a component type. */
export function renderNode(node: ReactNodeOrComponent) {
  if (node == null) return null;
  if (isValidElement(node)) return node;
  const Component = node as React.ComponentType;
  return <Component />;
}

const styles = StyleSheet.create({
  floatingHeader: {
    top: 0,
    left: 0,
    right: 0,
    zIndex: ZIndex.raised,
  } satisfies ViewStyle,
});
