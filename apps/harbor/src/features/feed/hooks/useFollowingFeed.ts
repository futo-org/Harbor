import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import {
  extractFeedToken,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { useChainedExtend } from './useChainedExtend';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  type FeedSortOption,
  feedQueryKeys,
  feedSortBy,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';

export function useFollowingFeed(options?: {
  sort?: FeedSortOption;
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { identityKey } = useCurrentIdentity();
  const sort = options?.sort ?? 'latest';
  const followerIdentity = identityKey ?? '';
  const enabled = (options?.enabled ?? true) && !!followerIdentity;
  const queryKey = feedQueryKeys.following(followerIdentity, sort);
  const omitLabels = useOmitLabels();

  const query = useQuery(
    queryKey,
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);

      return new Query.GetFollowingFeed({
        followerIdentity,
        sortBy: feedSortBy(sort),
        limit: options?.limit,
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
    queryKey,
  };
}
