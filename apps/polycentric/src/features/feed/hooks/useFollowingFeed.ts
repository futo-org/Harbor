import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Query, QueryStatus, v2 } from '@polycentric/react-native';
import {
  decodeFeedItems,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { feedQueryKeys } from './feedCache';

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const followerIdentity = client.activeIdentityKey || '';

  const query = useQuery(
    feedQueryKeys.following(),
    new Query.GetFollowingFeed({ followerIdentity }),
    undefined,
    enabled,
  );

  const items = useMemo(() => {
    if (!query.data) {
      return [];
    }
    const response = v2.GetFeedResponse.fromBinary(new Uint8Array(query.data));
    return decodeFeedItems(response);
  }, [query.data]);

  return {
    items,
    isLoading: query.status === QueryStatus.Loading,
    error: query.error ? new Error(query.error) : null,
    loadMore: NOOP,
    hasMore: false,
    refresh: query.refresh,
  };
}
