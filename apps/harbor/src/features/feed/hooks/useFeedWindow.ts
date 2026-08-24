import type { QueryKey } from '@/src/common/query/hooks/useQuery';
import { useMemo } from 'react';
import { FEED_INITIAL_WINDOW, FEED_WINDOW_STEP } from './feedCache';

/**
 * How many posts of the merged pool an emission may carry. The core holds the
 * rest and keeps reranking it, so a late page surfaces near the reader.
 *
 * The window is what the core anchors, so it belongs to one query: it starts
 * over whenever `queryKey` changes, or the next feed would anchor rows the
 * reader has never seen and later pages would land under them.
 *
 * `size` is read when a query builds its args, which is after `increase()`
 * and before the next render, so it is not state.
 */
export function useFeedWindow(queryKey: QueryKey): {
  readonly size: number;
  increase: () => void;
  reset: () => void;
} {
  const key = queryKey.join('\0');

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the joined key
  return useMemo(() => {
    let size = FEED_INITIAL_WINDOW;

    return {
      get size() {
        return size;
      },
      increase() {
        size += FEED_WINDOW_STEP;
      },
      reset() {
        size = FEED_INITIAL_WINDOW;
      },
    };
  }, [key]);
}
