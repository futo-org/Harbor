import type { ListRef } from '@/src/common/components/List';
import { type RefObject, useCallback, useRef } from 'react';
import type { FeedTab } from './feedCache';
import {
  type FeedName,
  useFeedSettingsHydrated,
  useFeedSettingsStore,
} from './useFeedSettingsStore';

/**
 * Selected tab for `feed`. `hydrated` is false until the stored selection has
 * been read back.
 */
export function useFeedTab(feed: FeedName): {
  tab: FeedTab;
  hydrated: boolean;
} {
  const tab = useFeedSettingsStore((state) => state.feeds[feed].tab);
  return { tab, hydrated: useFeedSettingsHydrated() };
}

/**
 * Handler for the tab row of `feed`. Re-tapping the active tab scrolls to the
 * top and refreshes rather than reselecting it.
 */
export function useFeedTabPress(
  feed: FeedName,
  listRef: RefObject<ListRef | null>,
  refresh: () => void,
): (tab: FeedTab) => void {
  // The feed hook returns a new `refresh` each render; a ref keeps this
  // handler — and so the header — stable.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  return useCallback(
    (next: FeedTab) => {
      const store = useFeedSettingsStore.getState();
      if (next === store.feeds[feed].tab) {
        listRef.current?.scrollToTop();
        refreshRef.current();
      } else {
        store.setFeedSettings(feed, { tab: next });
        // The list is not remounted on a tab change, so reset the offset here
        // instead.
        listRef.current?.scrollToTop({ animated: false });
      }
    },
    [feed, listRef],
  );
}
