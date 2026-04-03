import { useCallback, useMemo, useState, useEffect } from 'react';
import { RefreshControl, View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { types } from '@polycentric/react-native';
import { PostCardItem } from './PostCardItem';
import {
  usePostPage,
  useNavigateToParentPost,
  usePolycentricContext,
  useStore,
} from '@/src/common/lib/polycentric-hooks';

interface ConversationViewProps {
  postId: string;
  onPostPress: (postId: string) => void;
  onAuthorPress?: (publicKey: types.PublicKey) => void;
  onReply?: (signedEvent: types.SignedEvent) => void;
}

/** Each row subscribes to its own post. One post updates → one row re-renders. */
function PostRow({
  postId,
  isFocus,
  onPostPress,
  onAuthorPress,
  onReply,
  onReplyingToPress,
}: {
  postId: string;
  isFocus: boolean;
  onPostPress: (postId: string) => void;
  onAuthorPress?: (publicKey: types.PublicKey) => void;
  onReply?: (signedEvent: types.SignedEvent) => void;
  onReplyingToPress: (postId: string) => void;
}) {
  const { store } = usePolycentricContext();
  const post = useStore(store, (s) => s.posts[postId]);
  if (!post) return null;
  return (
    <View style={styles.replyContainer}>
      <PostCardItem
        postId={postId}
        onPress={isFocus ? undefined : () => onPostPress(postId)}
        onAuthorPress={
          onAuthorPress
            ? () => onAuthorPress(post.decoded.authorPublicKey)
            : undefined
        }
        onReply={() =>
          onReply ? onReply(post.signedEvent) : onPostPress(postId)
        }
        onReplyingToPress={() => onReplyingToPress(postId)}
        hideReplyingTo={false}
      />
    </View>
  );
}

export function ConversationView({
  postId,
  onPostPress,
  onAuthorPress,
  onReply,
}: ConversationViewProps) {
  const { replyIds, isLoading, reload } = usePostPage(postId);
  const handleReplyingToPress = useNavigateToParentPost(onPostPress);
  const [userDidPull, setUserDidPull] = useState(false);

  useEffect(() => {
    if (!isLoading) setUserDidPull(false);
  }, [isLoading]);

  const handleRefresh = useCallback(() => {
    setUserDidPull(true);
    reload();
  }, [reload]);

  const listIds = useMemo(() => [postId, ...replyIds], [postId, replyIds]);

  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <PostRow
        postId={item}
        isFocus={index === 0}
        onPostPress={onPostPress}
        onAuthorPress={onAuthorPress}
        onReply={onReply}
        onReplyingToPress={handleReplyingToPress}
      />
    ),
    [onPostPress, onAuthorPress, onReply, handleReplyingToPress],
  );

  // Only show refresh spinner when user pulled
  const showRefreshing = userDidPull && isLoading;

  return (
    <FlashList
      data={listIds}
      keyExtractor={(id) => id}
      renderItem={renderItem}
      refreshControl={
        <RefreshControl refreshing={showRefreshing} onRefresh={handleRefresh} />
      }
    />
  );
}

const styles = StyleSheet.create({
  replyContainer: {
    width: '100%',
  },
});
