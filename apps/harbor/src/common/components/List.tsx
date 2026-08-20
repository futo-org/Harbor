import { isWeb } from '@/src/common/util/platform';
import {
  FlashList,
  type FlashListRef,
  type FlashListProps,
  type ListRenderItem,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import {
  measureElement,
  useWindowVirtualizer,
  type Virtualizer,
} from '@tanstack/react-virtual';
import type React from 'react';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';
import { Atoms, useTheme } from '../theme';
import { HidingHeaderStack, renderNode, useHidingHeader } from './HidingHeader';
import { useForwardedScroll } from './ScrollForwarder';
import { InfoTooltip } from './InfoTooltip';
import { Text } from './primitives';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

const WEB_ESTIMATED_ITEM_HEIGHT = 150;
// Call onEndReached once the last rendered row is within this many rows of
// the end — roughly two viewports ahead, like the native onEndReachedThreshold.
const WEB_END_REACHED_BUFFER = 12;

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

// FlashList re-anchors to the old first row when items are prepended;
// disabled so a refresh at the top shows the new content.
const MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED = { disabled: true };

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
  /** Tracks the scroll offset */
  scrollY?: SharedValue<number>;
};

/** Imperative handle exposed by `List` (and `FeedList`). */
export type ListRef = {
  scrollToTop: (options?: { animated?: boolean }) => void;
};

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
  scrollY,
  maintainVisibleContentPosition = MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED,
  ...rest
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const ref = useRef<FlashListRef<T>>(null);
  // A `ScrollForwarder` above owns the header; without one the list hides
  // its own.
  const forwarded = useForwardedScroll();
  const hiding = useHidingHeader(initialHeaderHeight, scrollY);
  const { onHeaderLayout, translateStyle, headerHeight } = hiding;
  const onScroll = forwarded ? forwarded.onScroll : hiding.onScroll;
  const contentPaddingTop = forwarded
    ? forwarded.contentPaddingTop
    : hiding.contentPaddingTop;

  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: ({ animated = true } = {}) =>
        ref.current?.scrollToOffset({ offset: 0, animated }),
    }),
    [],
  );

  // Lets the header's owner align this list's offset with it.
  const register = forwarded?.register;
  useEffect(() => {
    if (!register) return;
    register({
      scrollToOffset: (offset) =>
        ref.current?.scrollToOffset({ offset, animated: false }),
      getScrollOffset: () => ref.current?.getAbsoluteLastScrollOffset() ?? 0,
    });
    return () => register(null);
  }, [register]);

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

  // Positions Android's refresh spinner; iOS ignores it.
  const adjustedRefreshControl = (
    isValidElement(refreshControl)
      ? cloneElement(
          refreshControl as React.ReactElement<{ progressViewOffset?: number }>,
          { progressViewOffset: contentPaddingTop },
        )
      : refreshControl
  ) as FlashListProps<T>['refreshControl'];

  const list = (
    <AnimatedFlashList
      ref={ref as React.Ref<FlashListRef<unknown>>}
      {...(rest as FlashListProps<unknown>)}
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      refreshControl={adjustedRefreshControl}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={mergedContentContainerStyle}
    />
  );

  if (forwarded) return <View style={Atoms.flex_1}>{list}</View>;

  return (
    <HidingHeaderStack
      header={renderedHeader}
      headerHeight={headerHeight}
      onHeaderLayout={onHeaderLayout}
      style={translateStyle}
    >
      {list}
    </HidingHeaderStack>
  );
}

// A screen the router keeps mounted but hides reports every row as zero-high.
// Storing that collapses the list, so every row lands at the same offset and
// the text stacks on itself for a frame when the screen comes back. Hold the
// last real height instead, and let the next resize correct it.
function measureVisibleRow(
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<Window, Element>,
) {
  const size = measureElement(element, entry, instance);
  if (size > 0) return size;
  const key = instance.options.getItemKey(instance.indexFromElement(element));
  return instance.itemSizeCache.get(key) ?? WEB_ESTIMATED_ITEM_HEIGHT;
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
  // The document is the scroll port on web, so virtualize against the window.
  // `scrollMargin` is the page offset of the rows, i.e. everything rendered
  // above them. The container only exists once the list has rows, so
  // remeasure when `isEmpty` flips.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (isEmpty || !containerRef.current) return;
    setScrollMargin(
      containerRef.current.getBoundingClientRect().top + window.scrollY,
    );
  }, [isEmpty]);
  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: ({ animated = true } = {}) => {
        window.scrollTo({ top: 0, behavior: animated ? 'smooth' : 'auto' });
      },
    }),
    [],
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
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => WEB_ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
    scrollMargin,
    // Rows measure during commit, where the default `flushSync` render costs a
    // list render per row and React warns. Measure outside commit instead.
    useFlushSync: false,
    useAnimationFrameWithResizeObserver: true,
    measureElement: measureVisibleRow,
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
