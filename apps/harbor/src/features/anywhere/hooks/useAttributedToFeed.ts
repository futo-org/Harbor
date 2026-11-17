import { shouldExtend } from '@/src/common/lib/polycentric-hooks';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  FeedSort,
  Query,
  QueryStatus,
  UpdateMode,
  v2,
} from '@polycentric/react-native';
import { useMemo } from 'react';

const PAGE_SIZE = 20;

/** A web page people have commented on, and how many comments it has. */
export type AnywhereFeedItem = { link: v2.Link; postCount: number };

function extractToken(data: ArrayBuffer | undefined): string | undefined {
  if (!data) return undefined;
  try {
    return v2.GetAttributedToFeedResponse.fromBinary(new Uint8Array(data))
      .pageInfo?.endCursor;
  } catch {
    return undefined;
  }
}

/** Decode the merged pages into rows; returns [pages, hasNextPage]. */
function decodePages(
  data: ArrayBuffer | undefined,
): [AnywhereFeedItem[], boolean] {
  if (!data || data.byteLength === 0) return [[], false];
  try {
    const response = v2.GetAttributedToFeedResponse.fromBinary(
      new Uint8Array(data),
    );
    const pages: AnywhereFeedItem[] = [];
    for (const item of response.items) {
      if (item.attributedTo?.to.oneofKind !== 'link') continue;
      pages.push({
        link: item.attributedTo.to.link,
        postCount: Number(item.postCount),
      });
    }
    return [pages, response.pageInfo?.hasNextPage ?? false];
  } catch {
    return [[], false];
  }
}

/** The web pages with the most comments lately, most commented first. */
export function useAttributedToFeed() {
  const query = useQuery(
    ['attributed-to-feed', 'top'],
    (_status, data) =>
      new Query.GetAttributedToFeed({
        sortBy: FeedSort.Top,
        limit: PAGE_SIZE,
        backwardToken: undefined,
        forwardToken: extractToken(data),
        onlyApplications: [],
        omitApplications: [],
      }),
    { updateMode: UpdateMode.Merge },
  );

  const [pages, hasNext] = useMemo(() => decodePages(query.data), [query.data]);

  return {
    pages,
    isLoading: query.status === QueryStatus.Loading,
    /** True only for a pull-to-refresh, not the first load. */
    isRefreshing: query.hasPendingRefresh,
    hasMore: hasNext,
    loadMore: () => {
      if (shouldExtend(hasNext, query)) query.extend();
    },
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}
