import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Query } from '@polycentric/react-native';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { EMPTY_FEED, useFeedsStore } from './useFeeds';

export function useExploreFeed(options?: {
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;

  const identity = client.activeIdentityKey ?? '';
  const feedKey = `explore:${identity}`;
  const queryKey = useMemo(() => ['explore_feed', identity], [identity]);
  const query = useMemo(
    () =>
      new Query.GetExploreFeed({
        identity: identity === '' ? undefined : identity,
      }),
    [identity],
  );

  const feed = useFeedsStore((s) => s.feeds.get(feedKey) ?? EMPTY_FEED);
  const subscribe = useFeedsStore((s) => s.subscribe);

  // Re-subscribe on every mount so the rust observable re-emits cached
  // state (instant) and `FetchMode::Default` triggers a fresh fan-out.
  // State persists in the store across mount/unmount.
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    unsubscribeRef.current = subscribe(client, feedKey, queryKey, query);
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [enabled, subscribe, client, feedKey, queryKey, query]);

  const refresh = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribe(client, feedKey, queryKey, query);
  }, [subscribe, client, feedKey, queryKey, query]);

  return {
    items: feed.items,
    isLoading: feed.isLoading,
    error: feed.error,
    loadMore: NOOP,
    hasMore: false,
    refresh,
  };
}
