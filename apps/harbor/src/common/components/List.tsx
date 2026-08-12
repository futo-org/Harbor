import { isWeb } from '@/src/common/util/platform';
import {
  FlashList,
  type FlashListRef,
  type FlashListProps,
  type ListRenderItem,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import { useVirtualizer } from '@tanstack/react-virtual';
import type React from 'react';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Atoms, useTheme } from '../theme';
import { HidingHeader, renderNode, useHidingHeader } from './HidingHeader';
import { InfoTooltip } from './InfoTooltip';
import { Text } from './primitives';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

const WEB_ESTIMATED_ITEM_HEIGHT = 150;
// Call onEndReached once the last rendered row is within this many rows of
// the end — roughly one viewport ahead, like the native onEndReachedThreshold.
const WEB_END_REACHED_BUFFER = 4;

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

// A list section header row, with an optional explanatory tooltip.
export function SectionHeader({
  title,
  tooltip,
}: {
  title: string;
  tooltip?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_xs,
        Atoms.px_lg,
        Atoms.pt_xl,
        Atoms.pb_sm,
      ]}
    >
      <Text
        variant="small"
        style={theme.atoms.text_neutral_medium}
        fontWeight="semibold"
      >
        {title}
      </Text>
      {tooltip ? <InfoTooltip text={tooltip} size={14} /> : null}
    </View>
  );
}

export type ListProps<T> = FlashListProps<T> & {
  HeaderComponent?:
    | React.ComponentType<any>
    | React.ReactElement<unknown, string | React.JSXElementConstructor<any>>
    | React.ExoticComponent<any>
    | null
    | undefined;
  /** Known height of `HeaderComponent`, used until it reports its own. */
  initialHeaderHeight?: number;
};

/** Imperative handle exposed by `List` (and `FeedList`). */
export type ListRef = { scrollToTop: () => void };

export const List = forwardRef(function List<T>(
  props: ListProps<T>,
  ref: React.Ref<ListRef>,
) {
  if (isWeb) {
    return <WebFeedViewer<T> {...props} listRef={ref} />;
  }

  return <NativeList<T> {...props} listRef={ref} />;
}) as <T>(
  props: ListProps<T> & { ref?: React.Ref<ListRef> },
) => React.ReactElement;

function NativeList<T>({
  HeaderComponent,
  initialHeaderHeight = 0,
  contentContainerStyle,
  refreshControl,
  onScroll: _ignoredOnScroll,
  listRef,
  ...rest
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const ref = useRef<FlashListRef<T>>(null);
  const {
    onScroll,
    headerAnimatedStyle,
    onHeaderLayout,
    scrollProps,
    contentPaddingTop,
    topOffset,
  } = useHidingHeader(initialHeaderHeight);

  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: () =>
        ref.current?.scrollToOffset({ offset: topOffset, animated: true }),
    }),
    [topOffset],
  );

  const renderedHeader = renderNode(HeaderComponent);

  // A new style object each render invalidates FlashList's layout cache.
  const mergedContentContainerStyle = useMemo(
    () => ({
      ...Atoms.flex_grow_1,
      paddingTop: contentPaddingTop,
      ...(typeof contentContainerStyle === 'object' &&
      contentContainerStyle !== null
        ? contentContainerStyle
        : {}),
    }),
    [contentPaddingTop, contentContainerStyle],
  );

  // Show below the sticky header
  const adjustedRefreshControl = (
    isValidElement(refreshControl)
      ? cloneElement(
          refreshControl as React.ReactElement<{ progressViewOffset?: number }>,
          {
            progressViewOffset: contentPaddingTop,
          },
        )
      : refreshControl
  ) as FlashListProps<T>['refreshControl'];

  return (
    <View style={[Atoms.flex_1]}>
      {renderedHeader ? (
        <HidingHeader style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          {renderedHeader}
        </HidingHeader>
      ) : null}

      <AnimatedFlashList
        ref={ref as React.Ref<FlashListRef<unknown>>}
        {...(rest as FlashListProps<unknown>)}
        {...scrollProps}
        refreshControl={adjustedRefreshControl}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={mergedContentContainerStyle}
      />
    </View>
  );
}

function WebFeedViewer<T>({
  data,
  renderItem,
  keyExtractor,
  HeaderComponent,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onEndReached,
  onLoad,
  contentContainerStyle,
  listRef,
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = (data as readonly T[] | null | undefined) ?? [];
  const isEmpty = items.length === 0;
  // The app shell scrolls in an inner `overflow-y: auto` div (body is
  // overflow hidden), so virtualize against the nearest scrollable ancestor
  // rather than the window. The container only exists once the list has
  // rows, so rediscover when `isEmpty` flips.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (isEmpty) return;
    let el: HTMLElement | null = containerRef.current?.parentElement ?? null;
    while (el) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      el = el.parentElement;
    }
    setScrollEl(el);
    if (el && containerRef.current) {
      setScrollMargin(
        containerRef.current.getBoundingClientRect().top -
          el.getBoundingClientRect().top +
          el.scrollTop,
      );
    }
  }, [isEmpty]);
  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: () => {
        (scrollEl ?? window).scrollTo({ top: 0, behavior: 'smooth' });
      },
    }),
    [scrollEl],
  );

  // Keep parity with native `FlashList` by calling `onLoad`.
  const hasFiredOnLoad = useRef(false);
  useEffect(() => {
    if (hasFiredOnLoad.current) return;
    hasFiredOnLoad.current = true;
    onLoad?.({ elapsedTimeInMs: 0 });
  }, [onLoad]);

  // Row heights vary, so each rendered row is measured via `measureElement`;
  // scrollMargin accounts for the headers rendered above the rows.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => WEB_ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) =>
      typeof keyExtractor === 'function'
        ? keyExtractor(items[index], index)
        : index,
  });
  const virtualItems = virtualizer.getVirtualItems();

  const lastRenderedIndex = virtualItems.length
    ? virtualItems[virtualItems.length - 1].index
    : -1;
  useEffect(() => {
    if (
      lastRenderedIndex >= 0 &&
      lastRenderedIndex >= items.length - 1 - WEB_END_REACHED_BUFFER
    ) {
      onEndReached?.();
    }
  }, [lastRenderedIndex, items.length, onEndReached]);

  return (
    <View style={[Atoms.flex_1, contentContainerStyle]}>
      {renderNode(HeaderComponent)}
      {renderNode(ListHeaderComponent)}
      {isEmpty ? (
        renderNode(ListEmptyComponent)
      ) : (
        <div
          ref={containerRef}
          style={{
            height: virtualizer.getTotalSize(),
            // RNW ancestors are column flex containers; without this the
            // spacer height gets flex-shrunk down to the viewport.
            flexShrink: 0,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualItems.map((vItem) => (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${
                  vItem.start - virtualizer.options.scrollMargin
                }px)`,
              }}
            >
              {renderItem?.({
                item: items[vItem.index],
                index: vItem.index,
                target: 'Cell',
                extraData: undefined,
              }) ?? null}
            </div>
          ))}
        </div>
      )}
      {renderNode(ListFooterComponent)}
    </View>
  );
}
