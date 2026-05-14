import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Query } from '@polycentric/react-native';
import {
  useLocalPostInjection,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { EMPTY_FEED, useFeedsStore } from './useFeeds';

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const followerIdentity = client.activeIdentityKey;

  const feedKey = `following:${followerIdentity ?? ''}`;
  const queryKey = useMemo(
    () => ['following_feed', followerIdentity ?? ''],
    [followerIdentity],
  );
  const query = useMemo(
    () =>
      followerIdentity
        ? new Query.GetFollowingFeed({ followerIdentity })
        : null,
    [followerIdentity],
  );

  const feed = useFeedsStore((s) => s.feeds.get(feedKey) ?? EMPTY_FEED);
  const subscribe = useFeedsStore((s) => s.subscribe);
  const insertLocal = useFeedsStore((s) => s.insertLocal);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !query) return;
    unsubscribeRef.current = subscribe(client, feedKey, queryKey, query);
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [enabled, subscribe, client, feedKey, queryKey, query]);

  useLocalPostInjection({
    enabled: enabled && !!followerIdentity,
    match: () => true,
    insert: (decoded) => insertLocal(feedKey, decoded),
  });

  const refresh = useCallback(() => {
    if (!query) return;
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
