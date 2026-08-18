import type { FeedHookResult } from '@/src/features/feed/hooks/types';
import type { FlashListProps } from '@/src/features/post';
import FeedList from '@/src/features/feed/FeedList';
import type { SharedValue } from 'react-native-reanimated';

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
  scrollY,
}: {
  tabs: ProfileFeedTab[];
  activeKey: string;
  ListHeaderComponent?: ListHeader;
  scrollY?: SharedValue<number>;
}) {
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  if (!active) return null;

  const { feed, bottomPadding } = active;

  return (
    <FeedList
      key={active.key}
      feed={feed}
      ListHeaderComponent={ListHeaderComponent}
      scrollY={scrollY}
      contentContainerStyle={
        bottomPadding ? { paddingBottom: bottomPadding } : undefined
      }
    />
  );
}
