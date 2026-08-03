import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import {
  extractFeedToken,
  shouldExtend,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  feedQueryKeys,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const followerIdentity = client.activeIdentityKey || '';
  const queryKey = feedQueryKeys.following();
  const omitLabels = useOmitLabels();

  const query = useQuery(
    queryKey,
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);

      return new Query.GetFollowingFeed({
        followerIdentity,
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
