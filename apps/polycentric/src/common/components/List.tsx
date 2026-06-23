import {
  FlashList,
  FlashListRef,
  type FlashListProps,
  type ListRenderItem,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import React, {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { LayoutChangeEvent, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Atoms } from '../theme';
import { isWeb } from '../util/platform';
import { HidingHeader, renderNode, useHidingHeader } from './HidingHeader';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

export type ListProps<T> = FlashListProps<T> & {
  HeaderComponent?:
    | React.ComponentType<any>
    | React.ReactElement<unknown, string | React.JSXElementConstructor<any>>
    | React.ExoticComponent<any>
    | null
    | undefined;
};

/** Imperative handle exposed by `List` (and `FeedList`). */
export type ListRef = { scrollToTop: () => void };

export const List = forwardRef(function List<T>(
  {
    HeaderComponent,
    contentContainerStyle,
    refreshControl,
    style,
    onScroll: _ignoredOnScroll,
    ...rest
  }: ListProps<T>,
  ref: React.Ref<ListRef>,
) {
  const flashListRef = useRef<FlashListRef<T>>(null);
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () =>
        flashListRef.current?.scrollToOffset({ offset: 0, animated: true }),
    }),
    [],
  );

  const { onScroll, headerHeight, headerAnimatedStyle, onHeaderLayout } =
    useHidingHeader();

  // Web: make the FlashList's own scrollbar masquerade as the window
  // scrollbar. The scroll element is stretched to cover the whole viewport
  // (negative left margin pulls it out to x=0, width spans the full window) so
  // the wheel scrolls the feed from anywhere on the page, and its scrollbar
  // lands at the window's right edge. The list content is offset back into the
  // column below (paddingLeft = column's left edge, width = column width).
  // FlashList derives item width from the inner content container — not this
  // outer width — so posts stay at the column width even though the scroller
  // is full-bleed. Staying in normal flow (vs. `position: fixed`) keeps the
  // hiding header and column borders working and avoids overlaying modals.
  const { width: windowWidth } = useWindowDimensions();
  const [columnRect, setColumnRect] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const containerRef = useRef<View>(null);
  const measureColumn = useCallback(() => {
    if (!isWeb) return;
    containerRef.current?.measureInWindow((x, _y, width) => {
      setColumnRect((prev) =>
        prev && prev.left === x && prev.width === width
          ? prev
          : { left: x, width },
      );
    });
  }, []);

  // Re-measure on layout and whenever the viewport width changes (resize /
  // breakpoint crossing), since both move the column's left edge.
  const onContainerLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureColumn();
    },
    [measureColumn],
  );

  useEffect(() => {
    measureColumn();
  }, [measureColumn, windowWidth]);

  const bleedScroller = isWeb && columnRect !== null;
  const scrollerStyle = bleedScroller
    ? { width: windowWidth, marginLeft: -columnRect.left }
    : undefined;

  const renderedHeader = renderNode(HeaderComponent);

  // Show below the sticky header
  const adjustedRefreshControl = (
    isValidElement(refreshControl)
      ? cloneElement(
          refreshControl as React.ReactElement<{ progressViewOffset?: number }>,
          {
            progressViewOffset: headerHeight,
          },
        )
      : refreshControl
  ) as FlashListProps<T>['refreshControl'];

  return (
    <View
      ref={containerRef}
      onLayout={onContainerLayout}
      style={[Atoms.flex_1]}
    >
      {renderedHeader ? (
        <HidingHeader style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          {renderedHeader}
        </HidingHeader>
      ) : null}

      <AnimatedFlashList
        ref={flashListRef as React.Ref<FlashListRef<unknown>>}
        {...(rest as FlashListProps<unknown>)}
        style={[style, scrollerStyle] as FlashListProps<unknown>['style']}
        refreshControl={adjustedRefreshControl}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerHeight,
          // Offset content back into the column: the full-bleed scroller starts
          // at x=0, so pad it left to the column's edge and cap the width so
          // posts render at the column width (not stretched across the window).
          ...(bleedScroller
            ? {
                width: columnRect.left + columnRect.width,
                paddingLeft: columnRect.left,
              }
            : {}),
          ...(typeof contentContainerStyle === 'object' &&
          contentContainerStyle !== null
            ? contentContainerStyle
            : {}),
        }}
      />
    </View>
  );
}) as <T>(
  props: ListProps<T> & { ref?: React.Ref<ListRef> },
) => React.ReactElement;
