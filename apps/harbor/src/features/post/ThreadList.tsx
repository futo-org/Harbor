import { useMemo, useState } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';
import { useOrderedThread } from './hooks/useOrderedThread';
import { useThread } from './hooks/useThread';
import { Atoms } from '@/src/common/theme';
import { ComposerInput } from '../composer';
import { List, type ListProps } from '@/src/common/components/List';
import { isWeb } from '@/src/common/util/platform';

type ThreadListProps = Omit<ListProps<PostData>, 'data' | 'renderItem'> & {
  post: PostData;
};

export function ThreadList({ post, ...rest }: ThreadListProps) {
  const { height: windowHeight } = useWindowDimensions();

  const thread = useThread(post);

  // Mount the subject by itself first.
  // Other items may or may not be available.
  // This is a reliable way to keep the subject at its intended scroll
  // position via FlashList maintainVisibleContentPosition.
  // Before this, we had issues with FlashList behaving differently with
  // cold vs warm caches at the call site.
  const [isFirstLayoutComplete, setIsFirstLayoutComplete] = useState(false);

  const subjectOnly = useMemo(() => [post], [post]);
  const orderedItems = useOrderedThread(post, thread.items);
  const items = isFirstLayoutComplete ? orderedItems : subjectOnly;

  const subjectIndex = items.findIndex((p) => p.id === post.id);

  return (
    <List
      {...rest}
      data={items}
      // Keeps the subject anchored while parents load in above it.
      maintainVisibleContentPosition={{ disabled: false }}
      initialScrollIndex={subjectIndex > 0 ? subjectIndex : undefined}
      onLoad={() => setIsFirstLayoutComplete(true)}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => {
        const above = index > 0 ? items[index - 1] : null;
        const below = index < items.length - 1 ? items[index + 1] : null;
        const lineAbove =
          !!above && item.reply?.parentId === above.id && above.id !== post.id;
        const lineBelow = !!below && below.reply?.parentId === item.id;

        const isSubject = item.id === post.id;
        return (
          <View style={[Atoms.w_full]}>
            <Post
              post={item}
              hideReplyingTo={true}
              focusedView={isSubject}
              disablePress={isSubject}
              showThreadLineAbove={lineAbove}
              showThreadLineBelow={lineBelow && !isSubject}
              hideBottomBorder={lineBelow && !isSubject}
            />
            {isSubject ? <ComposerInput replyTo={post.id} /> : null}
          </View>
        );
      }}
      ListFooterComponent={<View style={{ height: windowHeight }} />}
      refreshControl={
        !isWeb ? (
          <RefreshControl
            refreshing={thread.isRefreshing}
            onRefresh={thread.refresh}
          />
        ) : undefined
      }
    />
  );
}
