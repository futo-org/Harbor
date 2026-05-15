import { useMemo } from 'react';
import { Query, QueryStatus, v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  PostData,
} from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { useQuery } from '@/src/common/query/hooks/useQuery';

export function useIdentityFeed(
  identityId: string | null | undefined,
  _limit?: number,
  options?: { getIsAborted?: () => boolean; enabled?: boolean },
): FeedHookResult {
  const enabled = options?.enabled ?? true;
  const identity = identityId ?? '';

  const query = useQuery(
    ['identity_feed', identity],
    new Query.GetIdentityFeed({ identity }),
  );

  const items = useMemo(() => {
    if (!query.data) {
      return [];
    }
    const response = v2.GetFeedResponse.fromBinary(new Uint8Array(query.data));
    const items: PostData[] = [];
    for (const bundle of response.eventBundles) {
      const decoded = decodeV2PostBundle(bundle);
      if (decoded) items.push(decoded);
    }

    return items;
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
