import { Query, QueryStatus, UpdateMode, v2 } from '@polycentric/react-native';
import { extractFeedToken } from '@/src/common/lib/polycentric-hooks';
import { useChainedExtend } from './useChainedExtend';
import { useFeedWindow } from './useFeedWindow';
import type { FeedHookResult } from './types';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  FEED_PAGE_SIZE,
  feedQueryKeys,
  useFeedPageInfo,
  useFeedWithOverlays,
} from './feedCache';

/** What a post about `url` is attributed to, with the page's `info` if known. */
export function linkAttribution(
  url: string,
  info?: Partial<v2.Link> | null,
): v2.AttributedTo {
  const link = { ...info, title: info?.title ?? '', url };
  return { to: { oneofKind: 'link', link } };
}

/** Posts about `url`, newest first. */
export function useAttributionFeed(url: string | undefined): FeedHookResult {
  const queryKey = feedQueryKeys.attribution(url ?? '');
  const omitLabels = useOmitLabels();

  const window = useFeedWindow(queryKey);

  const query = useQuery(
    queryKey,
    (status, data) =>
      new Query.GetAttributionFeed({
        attributedTo: v2.AttributedTo.toBinary(
          linkAttribution(url ?? ''),
        ).slice().buffer as ArrayBuffer,
        limit: FEED_PAGE_SIZE,
        forwardToken: extractFeedToken(status, data),
        omitLabels,
        windowSize: window.size,
      }),
    { updateMode: UpdateMode.Merge },
    !!url,
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
