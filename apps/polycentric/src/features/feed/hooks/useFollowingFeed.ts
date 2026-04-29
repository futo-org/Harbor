import { useCallback, useEffect, useState } from 'react';
import { v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { EMPTY_POSTS, NOOP, type FeedHookResult } from './types';

export function useFollowingFeed(options?: {
  limit?: number;
  enabled?: boolean;
}): FeedHookResult {
  const { client } = usePolycentricContext();
  const enabled = options?.enabled ?? true;
  const [items, setItems] = useState<PostData[]>(EMPTY_POSTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchFeed = useCallback(async () => {
    if (client.servers.length === 0) return;
    if (!client.activeIdentityKey) {
      setItems(EMPTY_POSTS);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const bundles = await client.getFeed({
        algorithm: v2.FeedAlgorithm.FOLLOWING,
        limit: options?.limit ?? null,
      });
      const posts: PostData[] = [];
      for (const bundle of bundles) {
        const decoded = decodeV2PostBundle(bundle);
        if (decoded) posts.push(decoded);
      }
      setItems(posts);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [client, options?.limit]);

  useEffect(() => {
    if (enabled) fetchFeed();
  }, [enabled, fetchFeed]);

  return {
    items,
    isLoading,
    error,
    loadMore: NOOP,
    hasMore: false,
    refresh: fetchFeed,
  };
}
