import { useEffect, useCallback } from 'react';
import { usePolycentricContext } from './PolycentricProvider';
import { useStore, type PostState } from './store';

export function usePostState(postId: string | undefined): {
  state: PostState | undefined;
  handleLike: () => void;
  handleDislike: () => void;
} {
  const { store } = usePolycentricContext();

  const state = useStore(store, (s) => (postId ? s.posts[postId] : undefined));

  useEffect(() => {
    if (!postId) return;
    store.getState().ensurePostMetadataLoaded(postId);
  }, [store, postId]);

  const handleLike = useCallback(() => {
    if (!postId) return;
    store.getState().likePost(postId);
  }, [store, postId]);

  const handleDislike = useCallback(() => {
    if (!postId) return;
    store.getState().dislikePost(postId);
  }, [store, postId]);

  return { state, handleLike, handleDislike };
}
