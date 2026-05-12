import { useCallback, useEffect, useRef, useState } from 'react';
import { v2 } from '@polycentric/react-native';
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
  _options?: { getIsAborted?: () => boolean },
): FeedHookResult {
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

    const seen = new Set<string>();
    const observable = client.core.getIdentityFeed(
      identityId,
      undefined,
      undefined,
      undefined,
    );
    subscriptionRef.current = observable.subscribe({
      next: (bytes: ArrayBuffer) => {
        const response = v2.GetFeedResponse.fromBinary(new Uint8Array(bytes));
        const fresh: PostData[] = [];
        for (const bundle of response.eventBundles) {
          const decoded = decodeV2PostBundle(bundle);
          if (!decoded) continue;
          if (seen.has(decoded.id)) continue;
          seen.add(decoded.id);
          fresh.push(decoded);
        }
        if (fresh.length > 0) {
          // New array reference so React notices.
          setItems((prev) => [...prev, ...fresh]);
        }
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
    fetchFeed();
    return cleanup;
  }, [fetchFeed, cleanup]);

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
