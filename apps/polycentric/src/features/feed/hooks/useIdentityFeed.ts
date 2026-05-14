import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Query } from '@polycentric/react-native';
import {
  useLocalPostInjection,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { EMPTY_FEED, useFeedsStore } from './useFeeds';

export function useIdentityFeed(
  identityId: string | null | undefined,
  _limit?: number,
  options?: { getIsAborted?: () => boolean; enabled?: boolean },
): FeedHookResult {
  const enabled = options?.enabled ?? true;
  const { client } = usePolycentricContext();

  const feedKey = `identity:${identityId ?? ''}`;
  const queryKey = useMemo(
    () => ['identity_feed', identityId ?? ''],
    [identityId],
  );
  const query = useMemo(
    () =>
      identityId ? new Query.GetIdentityFeed({ identity: identityId }) : null,
    [identityId],
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
    enabled: enabled && !!identityId,
    match: (p) => p.identity === identityId,
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
