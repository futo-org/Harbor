import type { FeedHookResult } from '@/src/features/feed/hooks/types';
import { FeedViewer } from '@/src/features/post';

type ProfileFeedTab = {
  key: string;
  feed: FeedHookResult;
  bottomPadding?: number;
};

/**
 * Renders a set of profile feeds and shows the active one. The feed
 * hooks themselves live on the parent so their data + fetch state
 * survive tab switches; only the viewer is swapped.
 */
export function ProfileFeedSwitcher({
  tabs,
  activeKey,
}: {
  tabs: ProfileFeedTab[];
  activeKey: string;
}) {
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  if (!active) return null;
  return (
    <FeedViewer
      key={active.key}
      items={active.feed.items}
      isLoading={active.feed.isLoading}
      error={active.feed.error}
      onRefresh={active.feed.refresh}
      onEndReached={active.feed.loadMore}
      hasMore={active.feed.hasMore}
      bottomPadding={active.bottomPadding}
    />
  );
}
