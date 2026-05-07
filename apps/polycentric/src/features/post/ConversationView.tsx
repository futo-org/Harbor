import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { type PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';
import { usePostById } from './hooks/usePostById';
import { useThreadReplies } from './hooks/useThreadReplies';
import { Atoms } from '@/src/common/theme';
import { ComposerInput } from '../composer';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';

interface ConversationViewProps {
  post: PostData;
}

export function ConversationView({ post }: ConversationViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  const { post: rootPost } = usePostById(
    post.reply?.root?.identity,
    getKeyFingerprint(post.reply?.root?.signedBy),
    BigInt(post.reply?.root?.sequence || ''),
  );
  const { post: parentPost } = usePostById(
    post.reply?.parent?.identity,
    getKeyFingerprint(post.reply?.parent?.signedBy),
    BigInt(post.reply?.parent?.sequence || ''),
  );
  const { replies } = useThreadReplies(post);

  const items = useMemo(() => {
    const list: PostData[] = [];
    if (rootPost) list.push(rootPost);
    // Skip parent if it's the same as root (thread of depth 1).
    if (parentPost && parentPost.id !== rootPost?.id) list.push(parentPost);
    list.push(post);
    list.push(...replies);
    return list;
  }, [rootPost, parentPost, post, replies]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 0);
  }, []);

  return (
    <FlashList
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => (
        <View style={[Atoms.w_full]}>
          <Post
            post={item}
            hideReplyingTo={false}
            disablePress={item.id === post.id}
            showThreadLineAbove={item.id === post.id && !!item.reply?.parent}
            showThreadLineBelow={
              index < items.length - 1 && !!post.reply?.parent
            }
            hideBottomBorder={index < items.length - 1 && !!post.reply?.parent}
          />
          {item.id === post.id ? <ComposerInput replyTo={post.id} /> : null}
        </View>
      )}
      ListFooterComponent={<View style={{ height: windowHeight }} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    />
  );
}
