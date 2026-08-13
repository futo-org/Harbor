import {
  decodeFeedItems,
  type PostData,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  type QueryKey,
  RefreshStrategy,
  useQuery,
} from '@/src/common/query/hooks/useQuery';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  Query,
  QueryStatus,
  SearchPostsSort,
  UpdateMode,
  v2,
} from '@polycentric/react-native';
import { useEffect } from 'react';
import { useFeedDataStore } from '../../feed/hooks/feedCache';
import { EMPTY_POSTS, type FeedHookResult } from '../../feed/hooks/types';
import { useChainedExtend } from '../../feed/hooks/useChainedExtend';

export type PostSearchSort = 'top' | 'latest';

export const searchQueryKeys = {
  posts: (sort: PostSearchSort, query: string): string[] => [
    'search_posts',
    sort,
    query,
  ],
  users: (query: string): string[] => ['search_users', query],
};

function extractToken(data: ArrayBuffer | undefined): string | undefined {
  if (!data) return undefined;
  try {
    return v2.SearchPostsResponse.fromBinary(new Uint8Array(data)).pageInfo
      ?.endCursor;
  } catch {
    return undefined;
  }
}

function decodeSearchPostsResponse(
  data: ArrayBuffer,
): [PostData[], v2.PageInfo | undefined] {
  const response = v2.SearchPostsResponse.fromBinary(new Uint8Array(data));
  const feedShaped = v2.GetFeedResponse.create({
    eventBundles: response.results.flatMap((r) =>
      r.eventBundle ? [r.eventBundle] : [],
    ),
    eventHints: response.eventHints,
    pageInfo: response.pageInfo,
  });
  return [decodeFeedItems(feedShaped), response.pageInfo];
}

/**
 * Return any cached list of posts for the given args if present or derive a
 * new list.
 * Valid for any query that returns a `SearchPostsResponse`.
 * Keeps stable references between calls whenever possible.
 * Transparently handles local client overlays.
 */
function useSearchPostsWithOverlays(
  queryKey: QueryKey,
  queryData: ArrayBuffer | undefined,
): PostData[] {
  const key = queryKey.join('\0');
  const output = useFeedDataStore(
    (s) =>
      s.getFeedEntry(key, queryData, decodeSearchPostsResponse)?.output ??
      EMPTY_POSTS,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: output's value is a dependency within pullCachedFeed()
  useEffect(() => {
    if (queryData) useFeedDataStore.getState().pullCachedFeed(key, queryData);
  }, [key, queryData, output]);

  return output;
}

/**
 * Return any cached page info for the given args or decode the data and derive
 * the page info.
 * Valid for any query that returns a `SearchPostsResponse`.
 */
function useSearchPostsPageInfo(
  queryKey: QueryKey,
  queryData: ArrayBuffer | undefined,
): v2.PageInfo | undefined {
  const key = queryKey.join('\0');
  const pageInfo = useFeedDataStore(
    (s) => s.getFeedEntry(key, queryData, decodeSearchPostsResponse)?.pageInfo,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageInfo's value is a dependency within pullCachedFeed()
  useEffect(() => {
    if (queryData) useFeedDataStore.getState().pullCachedFeed(key, queryData);
  }, [key, queryData, pageInfo]);

  return pageInfo;
}

export function useSearchPosts(
  searchQuery: string,
  options?: {
    sort?: PostSearchSort;
    perServerLimit?: number;
    enabled?: boolean;
  },
): FeedHookResult {
  const enabled = (options?.enabled ?? true) && searchQuery.length > 0;
  const sort = options?.sort ?? 'top';
  const omitLabels = useOmitLabels();
  const queryKey = searchQueryKeys.posts(sort, searchQuery);

  const query = useQuery(
    queryKey,
    (_status, data) =>
      new Query.SearchPosts({
        query: searchQuery,
        sortBy:
          sort === 'latest' ? SearchPostsSort.Latest : SearchPostsSort.Default,
        limit: options?.perServerLimit,
        forwardToken: extractToken(data),
        omitLabels,
      }),
    { updateMode: UpdateMode.Merge },
    enabled,
  );

  const items = useSearchPostsWithOverlays(queryKey, query.data);
  const pageInfo = useSearchPostsPageInfo(queryKey, query.data);
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
