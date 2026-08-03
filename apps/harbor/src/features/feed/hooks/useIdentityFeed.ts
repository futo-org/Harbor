import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  feedQueryKeys,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';
import {
  extractFeedToken,
  shouldExtend,
} from '@/src/common/lib/polycentric-hooks';

export function useIdentityFeed(
  identityId: string | null | undefined,
  limit?: number,
  options?: { getIsAborted?: () => boolean; enabled?: boolean },
): FeedHookResult {
  const enabled = options?.enabled ?? true;
  const identity = identityId ?? '';
  const queryKey = feedQueryKeys.identity(identity);
  const omitLabels = useOmitLabels();

  const query = useQuery(
    queryKey,
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);
      return new Query.GetIdentityFeed({
        identity,
        limit,
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
