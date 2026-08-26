import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import {
  extractFeedToken,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { useChainedExtend } from './useChainedExtend';
import { useFeedWindow } from './useFeedWindow';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  type FeedSortOption,
  FEED_PAGE_SIZE,
  feedQueryKeys,
  feedSortBy,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';

export function useExploreFeed(options?: {
  sort?: FeedSortOption;
  perServerLimit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const sort = options?.sort ?? 'top';
  const identity = client.activeIdentityKey ?? '';
  const queryKey = feedQueryKeys.explore(identity, sort);
  const omitLabels = useOmitLabels();

  const window = useFeedWindow(queryKey);

  const query = useQuery(
    queryKey,
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);

      return new Query.GetExploreFeed({
        identity: identity === '' ? undefined : identity,
        sortBy: feedSortBy(sort),
        limit: options?.perServerLimit ?? FEED_PAGE_SIZE,
        forwardToken,
        omitLabels,
        windowSize: window.size,
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
    loadMore: async () => {
      window.increase();
      requestMore();
    },
    hasMore: hasNext,
    refresh: () => {
      window.reset();
      query.refresh(RefreshStrategy.Lazy);
    },
    queryKey,
  };
}
