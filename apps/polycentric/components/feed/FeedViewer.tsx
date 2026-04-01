import { useCallback } from 'react';
import { RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Box } from '@/components/layouts';
import { Text } from '@/components/primitives';
import { PostCardItem } from './PostCardItem';
import { types } from '@polycentric/react-native';
import { useLegacyTheme } from '@/legacyTheme';
import { usePolycentricContext, eventKey } from '@/lib/polycentric-hooks';
import type { PostState } from '@/lib/polycentric-hooks';

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
  const { legacyTheme } = useLegacyTheme();
  const { store } = usePolycentricContext();
  const getPost = useCallback(
    (postId: string): PostState | undefined => store.getState().posts[postId],
    [store],
  );

  const handleReplyingToPress = useCallback(
    (postId: string) => {
      const post = getPost(postId);
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
    [getPost, onPostPress],
  );

  const renderItem = useCallback(
    ({ item: postId }: { item: string }) => {
      const post = getPost(postId);
      if (!post) return null;

      return (
        <PostCardItem
          postId={postId}
          onPress={() => onPostPress(postId)}
          onAuthorPress={
            onAuthorPress
              ? () => onAuthorPress(post.decoded.authorPublicKey)
              : undefined
          }
          onReply={
            onReply
              ? () => onReply(post.signedEvent)
              : () => onPostPress(postId)
          }
          onReplyingToPress={() => handleReplyingToPress(postId)}
          showTopic={showTopic}
        />
      );
    },
    [
      getPost,
      onPostPress,
      onAuthorPress,
      onReply,
      handleReplyingToPress,
      showTopic,
    ],
  );

  const keyExtractor = useCallback(
    (item: string, index: number) => `${item}:${index}`,
    [],
  );

  if (error) {
    return (
      <Box flex={1} alignItems="center" justifyContent="center" padding="lg">
        <Text color="neutralSurface">Failed to load feed</Text>
      </Box>
    );
  }

  return (
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
          <Box padding="lg" alignItems="center">
            <ActivityIndicator
              size="small"
              color={legacyTheme.colors.neutralSurface}
            />
          </Box>
        ) : undefined
      }
      ListEmptyComponent={
        !isLoading ? (
          <Box
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding="lg"
          >
            <Text color="neutralSurface">No posts yet</Text>
          </Box>
        ) : null
      }
    />
  );
}
