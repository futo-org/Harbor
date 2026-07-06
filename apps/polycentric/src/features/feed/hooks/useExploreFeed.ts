import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import {
  extractFeedToken,
  shouldExtend,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { type FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { feedQueryKeys } from './feedCache';
import { useStableFeedItems } from './useStableFeedItems';

export function useExploreFeed(options?: {
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const identity = client.activeIdentityKey ?? '';

  const query = useQuery(
    feedQueryKeys.explore(identity),
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);

      return new Query.GetExploreFeed({
        identity: identity === '' ? undefined : identity,
        limit: options?.perServerLimit,
        forwardToken,
      });
    },
    { updateMode: UpdateMode.Merge },
    enabled,
  );

  const [items, hasNext] = useStableFeedItems(query.data);

  return {
    items,
    isLoading: query.status === QueryStatus.Loading,
    isRefreshing: query.hasPendingRefresh,
    error: query.error ? new Error(query.error) : null,
    loadMore: async () => {
      if (shouldExtend(hasNext, query)) {
        query.extend();
      }
    },
    hasMore: hasNext,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
