import { Query, QueryStatus, UpdateMode } from '@polycentric/react-native';
import {
  extractFeedToken,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { useChainedExtend } from './useChainedExtend';
import { useFeedWindow } from './useFeedWindow';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  FEED_PAGE_SIZE,
  feedQueryKeys,
  feedSortBy,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';

/**
 * The "For you" feed: posts the follower or the identities they follow created,
 * reacted to, reposted, quoted or replied to.
 */
export function useRecommendedFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { identityKey } = useCurrentIdentity();
  const followerIdentity = identityKey ?? '';
  const enabled = (options?.enabled ?? true) && !!followerIdentity;
  const queryKey = feedQueryKeys.recommended(followerIdentity);
  const omitLabels = useOmitLabels();

  const window = useFeedWindow(queryKey);

  const query = useQuery(
    queryKey,
    (status, data) => {
      const forwardToken = extractFeedToken(status, data);

      return new Query.GetRecommendedFeed({
        followerIdentity,
        sortBy: feedSortBy('top'),
        limit: options?.limit ?? FEED_PAGE_SIZE,
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
