import { Text } from '@/src/common/components/primitives';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  RefreshControl,
  View,
} from 'react-native';
import { Post } from './Post';

interface FeedViewerProps {
  items: PostData[];
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
  onEndReached?: () => void;
  hasMore?: boolean;
  bottomPadding?: number;
}

export function FeedViewer(props: FeedViewerProps) {
  if (props.error) {
    return (
      <View
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.p_lg,
        ]}
      >
        <Text color="neutral_500">Failed to load feed</Text>
      </View>
    );
  }

  // On web let the page scroll naturally — the Stack's content area
  // already has `overflow: auto`. Inline rendering keeps that scroll
  // chain intact instead of FlashList swallowing it.
  if (isWeb) {
    return <WebFeedViewer {...props} />;
  }
  return <NativeFeedViewer {...props} />;
}

function WebFeedViewer({
  items,
  isLoading,
  onEndReached,
  hasMore,
  bottomPadding,
}: FeedViewerProps) {
  const { theme } = useTheme();
  const sentinelRef = useRef<View>(null);

  // IntersectionObserver on a sentinel at the bottom triggers
  // `onEndReached` when the user scrolls near it.
  useEffect(() => {
    if (!hasMore || !onEndReached) return;
    const node = sentinelRef.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onEndReached();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onEndReached, items.length]);

  if (items.length === 0 && !isLoading) {
    return (
      <View
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.p_lg,
        ]}
      >
        <Text color="neutral_500">No posts yet</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: bottomPadding }}>
      {items.map((item, i) => (
        <Post key={`${item.id}:${i}`} post={item} />
      ))}
      {hasMore && <View ref={sentinelRef} style={{ height: 1 }} />}
      {isLoading && items.length > 0 ? (
        <View style={[Atoms.items_center, Atoms.p_lg]}>
          <ActivityIndicator
            size="small"
            color={theme.palette.neutral_500}
            accessibilityLabel="Loading more posts"
          />
        </View>
      ) : null}
    </View>
  );
}

function NativeFeedViewer({
  items,
  isLoading,
  onRefresh,
  onEndReached,
  hasMore,
  bottomPadding,
}: FeedViewerProps) {
  const { theme } = useTheme();

  const [layoutBox, setLayoutBox] = useState({ w: 0, h: 0 });
  const [hasLayout, setHasLayout] = useState(false);

  const onFeedContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayoutBox({ w: width, h: height });
    setHasLayout(true);
  }, []);

  // Inactive screens stay mounted with tiny dimensions. Hide the list
  // briefly until it has a valid layout to avoid a flash on back-nav.
  const layoutInvalid = hasLayout && (layoutBox.w < 2 || layoutBox.h < 2);

  const renderItem = useCallback(
    ({ item }: { item: PostData }) => <Post post={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: PostData, index: number) => `${item.id}:${index}`,
    [],
  );

  return (
    <View
      style={[Atoms.flex_1, layoutInvalid && { opacity: 0 }]}
      onLayout={onFeedContainerLayout}
    >
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        onEndReached={hasMore ? onEndReached : undefined}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        ListFooterComponent={
          hasMore && items.length > 0 ? (
            <View style={[Atoms.items_center, Atoms.p_lg]}>
              <ActivityIndicator
                size="small"
                color={theme.palette.neutral_500}
                accessibilityLabel="Loading more posts"
              />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          !isLoading ? (
            <View
              style={[
                Atoms.flex_1,
                Atoms.items_center,
                Atoms.justify_center,
                Atoms.p_lg,
              ]}
            >
              <Text color="neutral_500">No posts yet</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
