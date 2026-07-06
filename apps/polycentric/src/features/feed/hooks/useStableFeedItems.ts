import { useMemo, useRef } from 'react';
import {
  decodeFeedQueryResult,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';

// Mirror the list's keyExtractor (`FeedList` keys rows by `repostId ?? id`).
const keyOf = (item: PostData) => item.repostId ?? item.id;

/**
 * Decode a feed query buffer into items while preserving the object
 * reference for posts we've already decoded.
 *
 * Every `extend()`/`refresh()` produces a brand-new merged buffer, so a
 * naive `decodeFeedQueryResult(data)` rebuilds *every* `PostData` object.
 * That changes the `post` prop identity of every already-rendered row, so
 * all the memoized `Post` cells re-render at once and FlashList re-lays-out
 * the whole list — the previous items visibly flash on load-more.
 *
 * Polycentric posts are immutable content-addressed events, so the decoded
 * value for a given key never changes. We can therefore reuse the prior
 * reference for any key we've already seen: unchanged rows keep their
 * identity (and skip re-rendering), while only genuinely new rows mount.
 */
export function useStableFeedItems(
  data: ArrayBuffer | undefined,
): [PostData[], boolean] {
  const cache = useRef<Map<string, PostData>>(new Map());

  return useMemo(() => {
    const [decoded, hasNext] = decodeFeedQueryResult(data);
    const next = new Map<string, PostData>();
    const items = decoded.map((item) => {
      const key = keyOf(item);
      const stable = cache.current.get(key) ?? item;
      next.set(key, stable);
      return stable;
    });
    cache.current = next;
    return [items, hasNext];
  }, [data]);
}
