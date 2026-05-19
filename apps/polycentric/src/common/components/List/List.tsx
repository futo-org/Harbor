import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import {
  FlashList,
  type FlashListProps,
  type ListRenderItem,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

const WEB_INITIAL_VISIBLE = 12;
const WEB_PAGE_SIZE = 12;

// Keep the sticky header fully visible until the user has scrolled past
// this distance; only then does scroll-driven hiding kick in.
const HEADER_HIDE_THRESHOLD = 50;

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

export type ListProps<T> = FlashListProps<T>;

export function List<T extends PostData = PostData>(props: ListProps<T>) {
  if (isWeb) {
    return <WebFeedViewer<T> {...props} />;
  }

  return <NativeList<T> {...props} />;
}

function NativeList<T>({
  ListHeaderComponent,
  contentContainerStyle,
  refreshControl,
  onScroll: _ignoredOnScroll,
  ...rest
}: FlashListProps<T>) {
  const lastScrollY = useSharedValue(0);
  const headerTranslate = useSharedValue(0);
  const headerHeightShared = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    const currentY = event.contentOffset.y;
    const h = headerHeightShared.value;

    if (currentY <= HEADER_HIDE_THRESHOLD) {
      headerTranslate.value = 0;
    } else {
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
    lastScrollY.value = currentY;
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslate.value }],
  }));

  const onHeaderLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    headerHeightShared.value = next;
    if (next !== headerHeight) setHeaderHeight(next);
  };

  const renderedHeader = renderNode(ListHeaderComponent);

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
    <View style={styles.container}>
      {renderedHeader ? (
        <Animated.View
          onLayout={onHeaderLayout}
          style={[styles.stickyHeader, headerAnimatedStyle]}
        >
          {renderedHeader}
        </Animated.View>
      ) : null}
      <AnimatedFlashList
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
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onEndReached,
  contentContainerStyle,
  stickyHeaderIndices,
}: FlashListProps<T>) {
  const sentinelRef = useRef<View>(null);
  const items = (data as readonly T[] | null | undefined) ?? [];
  const [visibleCount, setVisibleCount] = useState(WEB_INITIAL_VISIBLE);

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

type ReactNodeOrComponent =
  | React.ReactElement
  | React.ComponentType
  | null
  | undefined;

function renderNode(node: ReactNodeOrComponent) {
  if (node == null) return null;
  if (isValidElement(node)) return node;
  const Component = node as React.ComponentType;
  return <Component />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
});
