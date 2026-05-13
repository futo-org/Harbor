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

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const [items, setItems] = useState<PostData[]>(EMPTY_POSTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Hold the live subscription so we can cancel on unmount / refresh /
  // identity change. The rust core fans out to every configured server
  // and emits each merged response as it arrives.
  const subscriptionRef = useRef<Sub | null>(null);

  const cleanup = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
  }, []);

  const fetchFeed = useCallback(() => {
    const followerIdentity = client.activeIdentityKey;
    if (!followerIdentity) {
      cleanup();
      setItems(EMPTY_POSTS);
      return;
    }

    cleanup();
    setItems(EMPTY_POSTS);
    setError(null);
    setIsLoading(true);

    const observable = client.core.getFollowingFeed(
      followerIdentity,
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

          const decoded = response.eventBundles
            .map((bundle) => decodeV2PostBundle(bundle))
            .filter((post) => !!post);

          setItems(decoded);
        }

        setIsLoading(result.status === QueryStatus.Loading);
      },
      error: (message: string) => {
        console.warn('useFollowingFeed error:', message);
        setError(new Error(message));
      },
      complete: () => {
        setIsLoading(false);
      },
    });
  }, [client, cleanup]);

  useEffect(() => {
    if (enabled) fetchFeed();
    return cleanup;
  }, [enabled, fetchFeed, cleanup]);

  useLocalPostInjection({
    match: () => true,
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
