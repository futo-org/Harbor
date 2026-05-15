import { useCallback, useState } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { type PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';
import { useThread } from './hooks/useThread';
import { Atoms } from '@/src/common/theme';
import { ComposerInput } from '../composer';

interface ConversationViewProps {
  post: PostData;
}

export function ConversationView({ post }: ConversationViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  const { thread } = useThread(post);

  // Fall back to rendering just the subject until the server response lands.
  const items = thread.length > 0 ? thread : [post];

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 0);
  }, []);

  return (
    <FlashList
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => {
        const above = index > 0 ? items[index - 1] : null;
        const below = index < items.length - 1 ? items[index + 1] : null;
        const lineAbove =
          !!above && item.reply?.parentId === above.id && above.id !== post.id;
        const lineBelow = !!below && below.reply?.parentId === item.id;

        return (
          <View style={[Atoms.w_full]}>
            <Post
              post={item}
              hideReplyingTo={true}
              disablePress={item.id === post.id}
              showThreadLineAbove={lineAbove}
              showThreadLineBelow={lineBelow}
              hideBottomBorder={lineBelow}
            />
            {item.id === post.id ? <ComposerInput replyTo={post.id} /> : null}
          </View>
        );
      }}
      ListFooterComponent={<View style={{ height: windowHeight }} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    />
  );
}
