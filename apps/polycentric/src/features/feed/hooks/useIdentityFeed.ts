import { useMemo } from 'react';
import { Query, QueryStatus, v2 } from '@polycentric/react-native';
import { decodeFeedItems } from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { feedQueryKeys } from './feedCache';

export function useIdentityFeed(
  identityId: string | null | undefined,
  _limit?: number,
  options?: { getIsAborted?: () => boolean; enabled?: boolean },
): FeedHookResult {
  const enabled = options?.enabled ?? true;
  const identity = identityId ?? '';

  const query = useQuery(
    feedQueryKeys.identity(identity),
    new Query.GetIdentityFeed({ identity }),
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
