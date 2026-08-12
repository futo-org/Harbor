import { forwardRef, useCallback, useMemo, useState } from 'react';
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
  <Post post={item} compactLinkPreview />
);

/** Row shapes differ enough in height that sharing a recycle pool forces a
 *  re-measure on every reuse. */
const defaultGetItemType = (item: PostData) => {
  if (item.images?.length) return 'images';
  if (item.quoteId) return 'quote';
  if (item.links?.length) return 'link';
  return 'text';
};

/** We keep the skeleton overlaid until then and reveal the feed
 *  settled. */
const FeedList = forwardRef<ListRef, FeedListProps>(function FeedList(
  {
    feed,
    emptyMessage = 'No posts yet',
    renderItem = defaultRenderItem,
    keyExtractor = defaultKeyExtractor,
    getItemType = defaultGetItemType,
    initialHeaderHeight = 0,
    ...rest
  },
  ref,
) {
  const { theme } = useTheme();

  const [firstLayoutDone, setFirstLayoutDone] = useState(false);
  const onLoad = useCallback(() => setFirstLayoutDone(true), []);
  const showLayoutShield = !firstLayoutDone && feed.items.length > 0 && !isWeb;

  const insets = useSafeAreaInsets();

  const emptyComponent = useMemo(
    () =>
      feed.isLoading ? (
        <PostSkeletonList />
      ) : (
        <ListEmpty>{emptyMessage}</ListEmpty>
      ),
    [feed.isLoading, emptyMessage],
  );

  const showLoadingMore = feed.hasMore && feed.items.length > 0;
  const footerComponent = useMemo(
    () => (
      <View style={[!isWeb && { paddingBottom: insets.bottom }]}>
        {showLoadingMore ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.palette.neutral_500}
              accessibilityLabel="Loading more posts"
            />
          </View>
        ) : null}
      </View>
    ),
    [showLoadingMore, insets.bottom, theme.palette.neutral_500],
  );

  return (
    <View style={Atoms.flex_1}>
      <List<PostData>
        ref={ref}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        data={feed.items}
        onLoad={onLoad}
        initialHeaderHeight={initialHeaderHeight}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={footerComponent}
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
      {showLayoutShield ? (
        <View
          pointerEvents="none"
          style={[
            Atoms.absolute,
            {
              top: initialHeaderHeight,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.palette.neutral_0,
            },
          ]}
        >
          <PostSkeletonList />
        </View>
      ) : null}
    </View>
  );
});

export default FeedList;
