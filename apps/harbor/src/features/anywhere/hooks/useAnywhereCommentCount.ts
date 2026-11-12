import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import { linkAttribution } from '@/src/features/feed/hooks/useAttributionFeed';
import { Query, v2 } from '@polycentric/react-native';
import { useEffect, useMemo, useRef } from 'react';

function decodePostCount(data: ArrayBuffer | undefined): number | undefined {
  if (!data || data.byteLength === 0) return undefined;
  try {
    const stats = v2.GetAttributedToStatsResponse.fromBinary(
      new Uint8Array(data),
    );
    return Number(stats.postCount);
  } catch {
    return undefined;
  }
}

/** The last count seen for each page, shown until a fresher one arrives. */
const knownCounts = new Map<string, number>();

/** Notes a page's comment count learned elsewhere, such as from a list. */
export function rememberCommentCount(url: string, count: number) {
  knownCounts.set(url, count);
}

/**
 * The comment count of the page at `url`, fetched again when `listed` (the
 * number of comments shown) changes.
 */
export function useAnywhereCommentCount(
  url: string | undefined,
  listed: number | undefined,
): number | undefined {
  const enabled = !!url;

  const query = useQuery(
    ['attributed-to-stats', url ?? ''],
    () =>
      new Query.GetAttributedToStats({
        attributedTo: v2.AttributedTo.toBinary(
          linkAttribution(url ?? ''),
        ).slice().buffer as ArrayBuffer,
      }),
    undefined,
    enabled,
  );

  // A comment was posted or removed since the count was fetched.
  const counted = useRef(listed);
  const { refresh } = query;
  useEffect(() => {
    if (listed === undefined || counted.current === listed) return;
    if (counted.current !== undefined) refresh(RefreshStrategy.Lazy);
    counted.current = listed;
  }, [listed, refresh]);

  const count = useMemo(() => decodePostCount(query.data), [query.data]);
  if (url && count !== undefined) knownCounts.set(url, count);
  return count ?? (url ? knownCounts.get(url) : undefined);
}

/** "1 comment", "2 comments". */
export function commentCountLabel(count: number): string {
  return count === 1 ? '1 comment' : `${count} comments`;
}
