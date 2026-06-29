import { forwardRef } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import {
  List,
  type ListProps,
  type ListRef,
  type ListRenderItem,
} from '../../common/components/List';
import type { FeedHookResult } from './hooks/types';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Atoms, useTheme } from '@/src/common/theme';
import { Post } from '../post/Post';
import { PostSkeletonList } from '../post/PostSkeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type FeedListProps = Omit<ListProps<PostData>, 'data' | 'renderItem'> & {
  feed: FeedHookResult;
  emptyMessage?: string;
  renderItem?: ListProps<PostData>['renderItem'];
};

const defaultKeyExtractor = (item: PostData) => item.repostId ?? item.id;

const defaultRenderItem: ListRenderItem<PostData> = ({ item }) => (
  <Post post={item} />
);

const FeedList = forwardRef<ListRef, FeedListProps>(function FeedList(
  {
    feed,
    emptyMessage = 'No posts yet',
    renderItem = defaultRenderItem,
    keyExtractor = defaultKeyExtractor,
    ...rest
  },
  ref,
) {
  const { theme } = useTheme();

  const insets = useSafeAreaInsets();

  return (
    <List<PostData>
      ref={ref}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      data={feed.items}
      ListEmptyComponent={
        feed.isLoading ? (
          <PostSkeletonList />
        ) : (
          <ListEmpty>{emptyMessage}</ListEmpty>
        )
      }
      ListFooterComponent={
        <View style={[!isWeb && { paddingBottom: insets.bottom }]}>
          {feed.hasMore && feed.items.length > 0 ? (
            <View style={[Atoms.items_center, Atoms.p_lg]}>
              <ActivityIndicator
                size="small"
                color={theme.palette.neutral_500}
                accessibilityLabel="Loading more posts"
              />
            </View>
          ) : null}
        </View>
      }
      onEndReached={feed.hasMore ? feed.loadMore : undefined}
      onEndReachedThreshold={0.5}
      refreshControl={
        !isWeb ? (
          <RefreshControl
            refreshing={feed.isRefreshing}
            onRefresh={feed.refresh}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
      {...rest}
    />
  );
});

export default FeedList;
