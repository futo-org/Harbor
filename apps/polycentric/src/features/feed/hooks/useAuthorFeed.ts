import { useCallback, useEffect, useRef, useState } from 'react';
import { v2 } from '@polycentric/react-native';
import {
  decodeV2PostBundle,
  usePolycentricContext,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { EMPTY_POSTS, NOOP, type FeedHookResult } from './types';

export function useAuthorFeed(
  identityId: string | null | undefined,
  _limit?: number,
  options?: { getIsAborted?: () => boolean },
): FeedHookResult {
  const { client } = usePolycentricContext();
  const [items, setItems] = useState<PostData[]>(EMPTY_POSTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Hold callers' abort callback in a ref so fetchFeed's identity stays stable
  // even when callers inline a fresh closure each render.
  const getIsAbortedRef = useRef(options?.getIsAborted);
  getIsAbortedRef.current = options?.getIsAborted;

  const fetchFeed = useCallback(async () => {
    if (!identityId) return;
    if (client.servers.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const bundles = await client.listEvents({ identity: identityId });
      if (getIsAbortedRef.current?.()) return;
      const posts: PostData[] = [];
      for (const bundle of bundles) {
        const decoded = decodeV2PostBundle(bundle);
        if (decoded) posts.push(decoded);
      }
      if (getIsAbortedRef.current?.()) return;
      setItems(posts);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [client, identityId]);

  useEffect(() => {
    if (identityId) fetchFeed();
  }, [identityId, fetchFeed]);

  // Inject locally-committed posts by this author as soon as they're
  // committed, before the server round-trip.
  useEffect(() => {
    if (!identityId) return;
    const listener = ({
      signedEvent,
      content,
    }: {
      signedEvent: v2.SignedEvent;
      content?: v2.Content;
    }) => {
      if (!content) return;
      const decoded = decodeV2PostBundle(
        v2.EventBundle.create({
          signedEvent,
          serializedContent: { contentBytes: v2.Content.toBinary(content) },
        }),
      );
      if (!decoded || decoded.identity !== identityId) return;
      setItems((prev) =>
        prev.some((p) => p.id === decoded.id) ? prev : [decoded, ...prev],
      );
    };
    client.events.onContentCreated(listener);
    return () => client.events.offContentCreated(listener);
  }, [client, identityId]);

  return {
    items,
    isLoading,
    error,
    loadMore: NOOP,
    hasMore: false,
    refresh: fetchFeed,
  };
}
