import { Text } from '@/src/common/components/primitives';
import type { FeedHookResult } from '@/src/features/feed/hooks/types';
import type { FlashListProps } from '@/src/features/post';
import FeedList from '@/src/features/feed/FeedList';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';

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
    <FeedList
      key={active.key}
      feed={feed}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={
        bottomPadding ? { paddingBottom: bottomPadding } : undefined
      }
    />
  );
}
