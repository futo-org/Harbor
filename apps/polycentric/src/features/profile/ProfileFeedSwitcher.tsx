import { Text } from '@/src/common/components/primitives';
import type { FeedHookResult } from '@/src/features/feed/hooks/types';
import { FeedViewer, type FlashListProps } from '@/src/features/post';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

type ProfileFeedTab = {
  key: string;
  feed: FeedHookResult;
  bottomPadding?: number;
};

type ListHeader = FlashListProps<unknown>['ListHeaderComponent'];

/**
 * Renders a set of profile feeds and shows the active one. The feed
 * hooks themselves live on the parent so their data + fetch state
 * survive tab switches; only the viewer is swapped.
 */
export function ProfileFeedSwitcher({
  tabs,
  activeKey,
  ListHeaderComponent,
}: {
  tabs: ProfileFeedTab[];
  activeKey: string;
  ListHeaderComponent?: ListHeader;
}) {
  const { theme } = useTheme();
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  if (!active) return null;

  const { feed, bottomPadding } = active;

  if (feed.error) {
    return (
      <View
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.p_lg,
        ]}
      >
        <Text color="neutral_500">Failed to load feed</Text>
      </View>
    );
  }

  return (
    <FeedViewer
      key={active.key}
      keyExtractor={(item) => item.id}
      data={feed.items}
      ListHeaderComponent={ListHeaderComponent}
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
            <Text color="neutral_500">No posts yet</Text>
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
      contentContainerStyle={
        bottomPadding ? { paddingBottom: bottomPadding } : undefined
      }
      showsVerticalScrollIndicator={false}
    />
  );
}
