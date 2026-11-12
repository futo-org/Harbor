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

/**
 * The comment count of the page at `url`, fetched once `listed` (the number
 * of comments shown) is known and again when it changes.
 */
export function useAnywhereCommentCount(
  url: string | undefined,
  listed: number | undefined,
): number | undefined {
  const enabled = !!url && listed !== undefined;

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

  return useMemo(() => decodePostCount(query.data), [query.data]);
}

/** "1 comment", "2 comments". */
export function commentCountLabel(count: number): string {
  return count === 1 ? '1 comment' : `${count} comments`;
}
