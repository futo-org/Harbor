import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePolycentricContext } from '../../../common/lib/polycentric-hooks/PolycentricProvider';
import { useStore } from '../../../common/lib/polycentric-hooks/store';
import usePost from './usePost';

const REPLIES_FEED_PREFIX = 'replies:';

const EMPTY_IDS: string[] = [];

/**
 * Post page: store owns loading; hook triggers load on focus.
 * Passes getIsAborted so loadPostPage can abort (skip applying results) after blur.
 */
export function usePostScreen(postId: string) {
  const { setPostId } = usePost();
  const isAbortedRef = useRef(false);

  const replyIds = EMPTY_IDS;
  const isLoading = false;

  useFocusEffect(
    useCallback(() => {
      isAbortedRef.current = false;
      if (postId) setPostId(postId);
      return () => {
        isAbortedRef.current = true;
      };
    }, [postId, setPostId]),
  );

  const reload = useCallback(() => {}, []);

  return { postId, replyIds, isLoading, reload };
}
