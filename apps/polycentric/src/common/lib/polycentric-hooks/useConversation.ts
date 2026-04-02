import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { types } from '@polycentric/react-native';
import { usePolycentricContext, usePolycentric } from './PolycentricProvider';
import { decodePostEvent, eventKey } from './helpers';
import { useStore } from './store';

const REPLIES_FEED_PREFIX = 'replies:';

const EMPTY_IDS: string[] = [];

/**
 * Post page: store owns loading; hook triggers load on focus.
 * Passes getIsAborted so loadPostPage can abort (skip applying results) after blur.
 */
export function usePostPage(postId: string) {
  const { store } = usePolycentricContext();
  const isAbortedRef = useRef(false);

  const feedKey = `${REPLIES_FEED_PREFIX}${postId}`;
  const replyIds = useStore(store, (s) => s.feeds[feedKey]?.ids ?? EMPTY_IDS);
  const isLoading = useStore(store, (s) => !!s.postPageLoading?.[postId]);

  useEffect(() => {
    if (postId)
      store
        .getState()
        .loadPostPage(postId, { getIsAborted: () => isAbortedRef.current });
    return () => {
      isAbortedRef.current = true;
    };
  }, [postId, store]);

  useFocusEffect(
    useCallback(() => {
      isAbortedRef.current = false;
      if (postId)
        store
          .getState()
          .loadPostPage(postId, { getIsAborted: () => isAbortedRef.current });
      return () => {
        isAbortedRef.current = true;
      };
    }, [postId, store]),
  );

  const reload = useCallback(() => {
    if (postId) store.getState().loadPostPage(postId);
  }, [postId, store]);

  return { postId, replyIds, isLoading, reload };
}

/** Callback to resolve parent post (cache or fetch) and call onPostPress(postId). */
export function useNavigateToParentPost(onPostPress: (postId: string) => void) {
  const client = usePolycentric();
  const { store } = usePolycentricContext();

  return useCallback(
    async (postId: string) => {
      const post = store.getState().posts[postId];
      if (!post) return;
      const { decoded } = post;
      if (
        !decoded.parentAuthorPublicKey?.key ||
        !decoded.parentProcess?.process ||
        decoded.parentLogicalClock == null
      )
        return;

      const parentId = eventKey(
        decoded.parentAuthorPublicKey.key,
        decoded.parentProcess.process,
        decoded.parentLogicalClock,
      );

      const cached = store.getState().posts[parentId];
      if (cached) {
        onPostPress(parentId);
        return;
      }

      try {
        const feed = client.queryManager.queryAuthorFeed(
          decoded.parentAuthorPublicKey,
          200,
        );
        const items = await feed.read();
        for (const fetched of items) {
          const d = decodePostEvent(fetched);
          if (d?.id === parentId) {
            store.getState().ingestPost(d.id, fetched, d);
            onPostPress(parentId);
            return;
          }
        }
      } catch {
        // ignore
      }
      onPostPress(parentId);
    },
    [client, store, onPostPress],
  );
}
