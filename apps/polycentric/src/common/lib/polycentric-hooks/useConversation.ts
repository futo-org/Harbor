import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePolycentricContext } from './PolycentricProvider';
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
