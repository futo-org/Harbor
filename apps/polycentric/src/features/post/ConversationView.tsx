import { useCallback, useMemo, useState, useEffect } from 'react';
import { RefreshControl, View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Post } from './Post';
import { usePostPage } from '@/src/common/lib/polycentric-hooks';

interface ConversationViewProps {
  postId: string;
}

function PostRow({ postId, isFocus }: { postId: string; isFocus: boolean }) {
  return (
    <View style={styles.replyContainer}>
      <Post postId={postId} hideReplyingTo={false} disablePress={isFocus} />
    </View>
  );
}

export function ConversationView({ postId }: ConversationViewProps) {
  const { replyIds, isLoading, reload } = usePostPage(postId);
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
      <PostRow postId={item} isFocus={index === 0} />
    ),
    [],
  );

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
