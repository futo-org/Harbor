import { isWeb } from '@/src/common/util/platform';
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
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Atoms } from '../theme';
import { HidingHeader, renderNode, useHidingHeader } from './HidingHeader';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

const WEB_INITIAL_VISIBLE = 12;
const WEB_PAGE_SIZE = 12;

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
  contentContainerStyle,
  refreshControl,
  onScroll: _ignoredOnScroll,
  listRef,
  ...rest
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const ref = useRef<FlashListRef<T>>(null);
  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: () =>
        ref.current?.scrollToOffset({ offset: 0, animated: true }),
    }),
    [],
  );
  const { onScroll, headerHeight, headerAnimatedStyle, onHeaderLayout } =
    useHidingHeader();

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
    <View style={[Atoms.flex_1]}>
      {renderedHeader ? (
        <HidingHeader style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          {renderedHeader}
        </HidingHeader>
      ) : null}

      <AnimatedFlashList
        ref={ref as React.Ref<FlashListRef<unknown>>}
        {...(rest as FlashListProps<unknown>)}
        refreshControl={adjustedRefreshControl}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerHeight,
          ...(typeof contentContainerStyle === 'object' &&
          contentContainerStyle !== null
            ? contentContainerStyle
            : {}),
        }}
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
  stickyHeaderIndices,
  listRef,
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const sentinelRef = useRef<View>(null);
  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: () => {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      },
    }),
    [],
  );
  const items = (data as readonly T[] | null | undefined) ?? [];
  const [visibleCount, setVisibleCount] = useState(WEB_INITIAL_VISIBLE);

  // Keep parity with native `FlashList` by calling `onLoad`.
  const hasFiredOnLoad = useRef(false);
  useEffect(() => {
    if (hasFiredOnLoad.current) return;
    hasFiredOnLoad.current = true;
    onLoad?.({ elapsedTimeInMs: 0 });
  }, [onLoad]);

  // Reset window when the underlying list shrinks (refresh, identity
  // switch, etc.) so we don't keep stale slicing offsets.
  useEffect(() => {
    if (visibleCount > items.length) {
      setVisibleCount(Math.max(WEB_INITIAL_VISIBLE, items.length));
    }
  }, [items.length, visibleCount]);

  useEffect(() => {
    const node = sentinelRef.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setVisibleCount((c) => {
          // First grow the local window; only delegate to the
          // consumer's onEndReached once we've exhausted the data.
          if (c < items.length) return c + WEB_PAGE_SIZE;
          onEndReached?.();
          return c;
        });
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onEndReached, items.length]);

  const isEmpty = items.length === 0;
  const visibleItems = isEmpty ? items : items.slice(0, visibleCount);

  return (
    <View style={contentContainerStyle}>
      {renderNode(HeaderComponent)}
      {renderNode(ListHeaderComponent)}
      {isEmpty
        ? renderNode(ListEmptyComponent)
        : visibleItems.map((item, index) => {
            const key =
              typeof keyExtractor === 'function'
                ? keyExtractor(item, index)
                : `${index}`;
            return (
              <View key={key}>
                {renderItem?.({
                  item,
                  index,
                  target: 'Cell',
                  extraData: undefined,
                }) ?? null}
              </View>
            );
          })}
      {!isEmpty ? <View ref={sentinelRef} style={{ height: 1 }} /> : null}
      {renderNode(ListFooterComponent)}
    </View>
  );
}
