import { Box } from '@/src/common/components/layouts';
import { Text } from '@/src/common/components/primitives';
import {
  eventKey,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { types } from '@polycentric/react-native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  RefreshControl,
  View,
} from 'react-native';
import { PostCardItem } from './PostCardItem';

interface FeedViewerProps {
  items: string[];
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
  onPostPress: (postId: string) => void;
  onAuthorPress?: (publicKey: types.PublicKey) => void;
  onReply?: (signedEvent: types.SignedEvent) => void;
  onEndReached?: () => void;
  hasMore?: boolean;
  bottomPadding?: number;
  showTopic?: boolean;
}

export function FeedViewer({
  items,
  isLoading,
  error,
  onRefresh,
  onPostPress,
  onAuthorPress,
  onReply,
  onEndReached,
  hasMore,
  bottomPadding,
  showTopic = true,
}: FeedViewerProps) {
  const { theme } = useTheme();
  const { store } = usePolycentricContext();

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

  const handleReplyingToPress = useCallback(
    (postId: string) => {
      const post = store.getState().posts[postId];
      if (!post) return;
      const { decoded } = post;
      if (
        !decoded.parentAuthorPublicKey?.key ||
        !decoded.parentProcess?.process ||
        decoded.parentLogicalClock == null
      )
        return;

      const parentId = eventKey(
        decoded.parentAuthorPublicKey.key,
        decoded.parentProcess.process,
        decoded.parentLogicalClock,
      );
      onPostPress(parentId);
    },
    [store, onPostPress],
  );

  const renderItem = useCallback(
    ({ item: postId }: { item: string }) => (
      <PostCardItem
        postId={postId}
        onPostPress={onPostPress}
        onAuthorPress={onAuthorPress}
        onReply={onReply}
        onReplyingToPress={handleReplyingToPress}
        showTopic={showTopic}
      />
    ),
    [onPostPress, onAuthorPress, onReply, handleReplyingToPress, showTopic],
  );

  const keyExtractor = useCallback(
    (item: string, index: number) => `${item}:${index}`,
    [],
  );

  if (error) {
    return (
      <Box
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.p_lg,
        ]}
      >
        <Text color="neutral_500">Failed to load feed</Text>
      </Box>
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
            <Box style={[Atoms.items_center, Atoms.p_lg]}>
              <ActivityIndicator
                size="small"
                color={theme.palette.neutral_500}
                accessibilityLabel="Loading more posts"
              />
            </Box>
          ) : undefined
        }
        ListEmptyComponent={
          !isLoading ? (
            <Box
              style={[
                Atoms.flex_1,
                Atoms.items_center,
                Atoms.justify_center,
                Atoms.p_lg,
              ]}
            >
              <Text color="neutral_500">No posts yet</Text>
            </Box>
          ) : null
        }
      />
    </View>
  );
}
