import { useMemo } from 'react';
import { Query, QueryStatus, v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  PostData,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult, NOOP } from './types';
import { useQuery } from '@/src/common/query/hooks/useQuery';
import { feedQueryKeys } from './feedCache';

export function useExploreFeed(options?: {
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const identity = client.activeIdentityKey ?? '';

  const query = useQuery(
    feedQueryKeys.explore(identity),
    new Query.GetExploreFeed({
      identity: identity === '' ? undefined : identity,
    }),
    undefined,
    enabled,
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
