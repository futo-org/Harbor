import {
  ExploreFeedSort,
  Query,
  QueryStatus,
  UpdateMode,
} from '@polycentric/react-native';
import {
  extractFeedToken,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { useChainedExtend } from './useChainedExtend';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  type ExploreSort,
  feedQueryKeys,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';

const SORT_BY: Record<ExploreSort, ExploreFeedSort> = {
  top: ExploreFeedSort.Top,
  latest: ExploreFeedSort.Latest,
};

export function useExploreFeed(options?: {
  sort?: ExploreSort;
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const sort = options?.sort ?? 'top';
  const identity = client.activeIdentityKey ?? '';
  const queryKey = feedQueryKeys.explore(identity, sort);
  const omitLabels = useOmitLabels();

  const query = useQuery(
    queryKey,
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);

      return new Query.GetExploreFeed({
        identity: identity === '' ? undefined : identity,
        sortBy: SORT_BY[sort],
        limit: options?.perServerLimit,
        forwardToken,
        omitLabels,
      });
    },
    { updateMode: UpdateMode.Merge },
    enabled,
  );

  const items = useFeedWithOverlays(queryKey, query.data);
  const pageInfo = useFeedPageInfo(queryKey, query.data);
  const hasNext = pageInfo?.hasNextPage ?? false;
  const requestMore = useChainedExtend(query, items.length, hasNext);

  return {
    items,
    isLoading: query.status === QueryStatus.Loading,
    isRefreshing: query.hasPendingRefresh,
    error: query.error ? new Error(query.error) : null,
    loadMore: async () => requestMore(),
    hasMore: hasNext,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
