import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { useCallback } from 'react';
import type { FeedTab } from './feedCache';
import {
  type FeedName,
  useFeedSettingsHydrated,
  useFeedSettingsStore,
} from './useFeedSettingsStore';

/**
 * Tab state for a feed screen. Re-tapping the active tab emits a focused
 * refresh, the same as re-tapping the nav item. `hydrated` is false until
 * the stored tab has been read back.
 */
export function useFeedTabs(feed: FeedName): {
  tab: FeedTab;
  hydrated: boolean;
  onTabPress: (tab: FeedTab) => void;
} {
  const tab = useFeedSettingsStore((state) => state.feeds[feed].tab);
  const hydrated = useFeedSettingsHydrated();

  const onTabPress = useCallback(
    (next: FeedTab) => {
      const store = useFeedSettingsStore.getState();
      if (next === store.feeds[feed].tab) {
        emitFocusedRefresh();
        return;
      }
      store.setFeedSettings(feed, { tab: next });
    },
    [feed],
  );

  return { tab, hydrated, onTabPress };
}
