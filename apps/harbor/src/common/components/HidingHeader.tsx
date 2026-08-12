import { Atoms, ZIndex } from '@/src/common/theme';
import { isIOS } from '@/src/common/util/platform';
import React, {
  isValidElement,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  type LayoutChangeEvent,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type StyleProps,
} from 'react-native-reanimated';

// Keep the sticky header fully visible until the user has scrolled past
// this distance; only then does scroll-driven hiding kick in.
const HEADER_HIDE_THRESHOLD = 50;

/** `initialHeight` avoids a re-layout when the header's height is known:
 *  on Android `onLayout` lands after the list has already measured.
 *
 *  The header's space is reserved with `contentInset` on iOS — UIKit then
 *  anchors the refresh spinner to the inset, below the sticky header —
 *  and with content padding on Android, where the spinner is positioned
 *  via `progressViewOffset` instead. Consumers spread `scrollProps` onto
 *  the scrollable, pad their content by `contentPaddingTop`, and treat
 *  `topOffset` as the scroll offset of the very top. */
export function useHidingHeader(initialHeight = 0) {
  const lastScrollY = useSharedValue(0);
  const headerTranslate = useSharedValue(0);
  const headerHeightShared = useSharedValue(initialHeight);
  const isDragging = useSharedValue(false);
  const isMomentum = useSharedValue(false);
  const [headerHeight, setHeaderHeight] = useState(initialHeight);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      isDragging.value = true;
    },
    onEndDrag: () => {
      isDragging.value = false;
    },
    onMomentumBegin: () => {
      isMomentum.value = true;
    },
    onMomentumEnd: () => {
      isMomentum.value = false;
    },
    onScroll: (event) => {
      const h = headerHeightShared.value;
      // With `contentInset` the offset rests at -headerHeight, not 0.
      const currentY = event.contentOffset.y + (isIOS ? h : 0);

      if (currentY <= HEADER_HIDE_THRESHOLD) {
        headerTranslate.value = 0;
      } else if (isDragging.value || isMomentum.value) {
        // Compute delta relative to the threshold so movement past it
        // starts the hide from translate 0 instead of snapping.
        const lastEffective = Math.max(
          0,
          lastScrollY.value - HEADER_HIDE_THRESHOLD,
        );
        const currentEffective = currentY - HEADER_HIDE_THRESHOLD;
        const delta = currentEffective - lastEffective;
        const next = headerTranslate.value - delta;
        headerTranslate.value = Math.min(0, Math.max(-h, next));
      }
      // Always update so the next user-driven event computes the correct
      // delta — even if we skipped animating this tick.
      lastScrollY.value = currentY;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslate.value }],
  }));

  const onHeaderLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    headerHeightShared.value = next;
    if (next !== headerHeight) setHeaderHeight(next);
  };

  const scrollProps = useMemo(
    () =>
      isIOS
        ? {
            contentInset: { top: headerHeight },
            contentOffset: { x: 0, y: -headerHeight },
            scrollIndicatorInsets: { top: headerHeight },
          }
        : undefined,
    [headerHeight],
  );

  return {
    onScroll,
    headerHeight,
    headerAnimatedStyle,
    onHeaderLayout,
    scrollProps,
    contentPaddingTop: isIOS ? 0 : headerHeight,
    topOffset: isIOS ? -headerHeight : 0,
  };
}

/** The absolutely-positioned, animated wrapper around a sticky header. */
export function HidingHeader({
  children,
  style,
  onLayout,
}: {
  children: ReactNode;
  style: StyleProps;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <Animated.View
      onLayout={onLayout}
      style={[Atoms.absolute, styles.stickyHeader, style]}
    >
      {children}
    </Animated.View>
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
  stickyHeader: {
    top: 0,
    left: 0,
    right: 0,
    zIndex: ZIndex.raised,
  } satisfies ViewStyle,
});
