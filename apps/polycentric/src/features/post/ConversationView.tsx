import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { type PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';
import { usePostById } from './hooks/usePostById';

interface ConversationViewProps {
  post: PostData;
}

// TODO: reply list previously lived in a store-backed feed. Reintroduce reply
// loading via `listEvents` with a parent-pointer filter once that filter is
// supported.
export function ConversationView({ post }: ConversationViewProps) {
  const [refreshing, setRefreshing] = useState(false);

  const { post: rootPost } = usePostById(
    post.reply?.root?.identity,
    post.reply?.root?.sequence,
  );
  const { post: parentPost } = usePostById(
    post.reply?.parent?.identity,
    post.reply?.parent?.sequence,
  );

  const items = useMemo(() => {
    const list: PostData[] = [];
    if (rootPost) list.push(rootPost);
    // Skip parent if it's the same as root (thread of depth 1).
    if (parentPost && parentPost.id !== rootPost?.id) list.push(parentPost);
    list.push(post);
    return list;
  }, [rootPost, parentPost, post]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 0);
  }, []);

  return (
    <FlashList
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Post
            post={item}
            hideReplyingTo={false}
            disablePress={item.id === post.id}
          />
        </View>
      )}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
});
