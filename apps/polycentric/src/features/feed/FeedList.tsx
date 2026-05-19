import { ActivityIndicator, RefreshControl, View } from 'react-native';
import {
  List,
  type ListProps,
  type ListRenderItem,
} from '../../common/components/List/List';
import type { FeedHookResult } from './hooks/types';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme } from '@/src/common/theme';
import { Post } from '../post/Post';

export type FeedListProps = Omit<ListProps<PostData>, 'data' | 'renderItem'> & {
  feed: FeedHookResult;
  emptyMessage?: string;
  renderItem?: ListProps<PostData>['renderItem'];
};

const defaultKeyExtractor = (item: PostData) => item.id;

const defaultRenderItem: ListRenderItem<PostData> = ({ item }) => (
  <Post post={item} />
);

export default function FeedList({
  feed,
  emptyMessage = 'No posts yet',
  renderItem = defaultRenderItem,
  keyExtractor = defaultKeyExtractor,
  ...rest
}: FeedListProps) {
  const { theme } = useTheme();

  return (
    <List<PostData>
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      data={feed.items}
      ListEmptyComponent={
        !feed.isLoading ? (
          <View
            style={[
              Atoms.flex_1,
              Atoms.items_center,
              Atoms.justify_center,
              Atoms.p_lg,
            ]}
          >
            <Text color="neutral_500">{emptyMessage}</Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        feed.hasMore && feed.items.length > 0 ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.palette.neutral_500}
              accessibilityLabel="Loading more posts"
            />
          </View>
        ) : null
      }
      onEndReached={feed.hasMore ? feed.loadMore : undefined}
      onEndReachedThreshold={0.5}
      refreshControl={
        !isWeb ? (
          <RefreshControl
            refreshing={feed.isLoading}
            onRefresh={feed.refresh}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
      {...rest}
    />
  );
}
