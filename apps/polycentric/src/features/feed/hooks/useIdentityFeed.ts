import { useCallback, useEffect, useRef, useState } from 'react';
import { QueryStatus, v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  useLocalPostInjection,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { EMPTY_POSTS, NOOP, type FeedHookResult } from './types';

type Sub = { unsubscribe: () => void };

export function useIdentityFeed(
  identityId: string | null | undefined,
  _limit?: number,
  options?: { getIsAborted?: () => boolean; enabled?: boolean },
): FeedHookResult {
  const enabled = options?.enabled ?? true;
  const { client } = usePolycentricContext();
  const [items, setItems] = useState<PostData[]>(EMPTY_POSTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Hold the live subscription so we can cancel on unmount / refresh /
  // identity change. The rust core fans out to every configured server
  // and pushes one `next` per server, then a single `complete`.
  const subscriptionRef = useRef<Sub | null>(null);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
  }, []);

  const fetchFeed = useCallback(() => {
    if (!identityId) return;

    cleanup();
    setItems(EMPTY_POSTS);
    setError(null);
    setIsLoading(true);

    // Rust-side merge_fn already dedupes by EventKey — each next()
    // carries the full merged feed plus a status. `Loading` stays in
    // effect until the last per-server response arrives.
    const observable = client.core.getIdentityFeed(
      identityId,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    subscriptionRef.current = observable.subscribe({
      next: (result) => {
        if (result.data) {
          const response = v2.GetFeedResponse.fromBinary(
            new Uint8Array(result.data),
          );
          const posts: PostData[] = [];
          for (const bundle of response.eventBundles) {
            const decoded = decodeV2PostBundle(bundle);
            if (decoded) posts.push(decoded);
          }
          setItems(posts);
        }
        setIsLoading(result.status === QueryStatus.Loading);
      },
      error: (message: string) => {
        console.warn('useIdentityFeed error:', message);
        setError(new Error(message));
      },
      complete: () => {
        setIsLoading(false);
      },
    });
  }, [client, identityId, cleanup]);

  useEffect(() => {
    if (enabled) fetchFeed();
    return cleanup;
  }, [enabled, fetchFeed, cleanup]);

  useLocalPostInjection({
    enabled: !!identityId,
    match: (p) => p.identity === identityId,
    insert: (decoded) =>
      setItems((prev) =>
        prev.some((p) => p.id === decoded.id) ? prev : [decoded, ...prev],
      ),
  });

  return {
    items,
    isLoading,
    error,
    loadMore: NOOP,
    hasMore: false,
    refresh: fetchFeed,
  };
}
