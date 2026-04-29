import { Text } from '@/src/common/components/primitives';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
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

export function FeedViewer({
  items,
  isLoading,
  error,
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

  // Our routing and navigation leaves
  // inactive screens mounted with tiny dimensions.
  // When navigating back, this can cause a momentary visual glitch.
  // Hiding the invalid layout prevents the visual glitch.
  const layoutInvalid = hasLayout && (layoutBox.w < 2 || layoutBox.h < 2);

  const renderItem = useCallback(
    ({ item }: { item: PostData }) => <Post post={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: PostData, index: number) => `${item.id}:${index}`,
    [],
  );

  if (error) {
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

  return (
    <View
      style={[
        Atoms.flex_1,
        isWeb &&
          layoutInvalid && {
            opacity: 0,
            pointerEvents: 'none',
          },
      ]}
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
