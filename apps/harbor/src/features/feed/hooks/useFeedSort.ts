import type { ListRef } from '@/src/common/components/List';
import { type RefObject, useCallback, useRef } from 'react';
import type { FeedSortOption } from './feedCache';
import {
  type FeedName,
  useFeedSettingsHydrated,
  useFeedSettingsStore,
} from './useFeedSettingsStore';

/**
 * Selected sort tab for `feed`. `hydrated` is false until the stored
 * selection has been read back.
 */
export function useFeedSort(feed: FeedName): {
  sort: FeedSortOption;
  hydrated: boolean;
} {
  const sort = useFeedSettingsStore((state) => state.feeds[feed].sort);
  return { sort, hydrated: useFeedSettingsHydrated() };
}

/**
 * Handler for the sort tabs of `feed`. Re-tapping the active tab scrolls to
 * the top and refreshes rather than re-sorting.
 */
export function useFeedSortPress(
  feed: FeedName,
  listRef: RefObject<ListRef | null>,
  refresh: () => void,
): (sort: FeedSortOption) => void {
  // The feed hook returns a new `refresh` each render; a ref keeps this
  // handler — and so the header — stable.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  return useCallback(
    (next: FeedSortOption) => {
      const store = useFeedSettingsStore.getState();
      if (next === store.feeds[feed].sort) {
        listRef.current?.scrollToTop();
        refreshRef.current();
      } else {
        store.setFeedSettings(feed, { sort: next });
      }
    },
    [feed, listRef],
  );
}
