import { useCallback, useRef } from 'react';
import type { FeedTab } from './feedCache';
import {
  type FeedName,
  useFeedSettingsHydrated,
  useFeedSettingsStore,
} from './useFeedSettingsStore';

/** What the page being shown exposes to its screen. */
export type FeedPageControl = {
  scrollToTop: () => void;
  refresh: () => void;
};

export type FeedPageControlRef = { current: FeedPageControl | null };

/**
 * Tab state for a feed screen. The showing page registers itself in `control`,
 * so re-tapping its tab scrolls it to the top and refreshes it. `hydrated` is
 * false until the stored tab has been read back.
 */
export function useFeedTabs(feed: FeedName): {
  tab: FeedTab;
  hydrated: boolean;
  control: FeedPageControlRef;
  onTabPress: (tab: FeedTab) => void;
  refreshActive: () => void;
} {
  const tab = useFeedSettingsStore((state) => state.feeds[feed].tab);
  const hydrated = useFeedSettingsHydrated();

  const control = useRef<FeedPageControl | null>(null);

  const refreshActive = useCallback(() => {
    control.current?.scrollToTop();
    control.current?.refresh();
  }, []);

  const onTabPress = useCallback(
    (next: FeedTab) => {
      const store = useFeedSettingsStore.getState();
      if (next === store.feeds[feed].tab) {
        refreshActive();
        return;
      }
      store.setFeedSettings(feed, { tab: next });
    },
    [feed, refreshActive],
  );

  return { tab, hydrated, control, onTabPress, refreshActive };
}
