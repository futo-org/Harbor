import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import { type FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { feedQueryKeys } from './feedCache';
import {
  extractFeedToken,
  shouldExtend,
} from '@/src/common/lib/polycentric-hooks';
import { useStableFeedItems } from './useStableFeedItems';

export function useIdentityFeed(
  identityId: string | null | undefined,
  limit?: number,
  options?: { getIsAborted?: () => boolean; enabled?: boolean },
): FeedHookResult {
  const enabled = options?.enabled ?? true;
  const identity = identityId ?? '';

  const query = useQuery(
    feedQueryKeys.identity(identity),
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);
      return new Query.GetIdentityFeed({ identity, limit, forwardToken });
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
