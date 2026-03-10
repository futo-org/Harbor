import { useCallback, useEffect } from 'react';
import { types } from '@polycentric/react-native';
import {
  usePolycentricContext,
  useStore,
  useUsername,
} from '@/lib/polycentric-hooks';
import { PostCard } from './PostCard';

const EMPTY_PUBKEY = types.PublicKey.create();

interface PostCardItemProps {
  postId: string;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onReply?: () => void;
  onReplyingToPress?: () => void;
  hideReplyingTo?: boolean;
  showTopic?: boolean;
}

export function PostCardItem({
  postId,
  onPress,
  onAuthorPress,
  onReply,
  onReplyingToPress,
  hideReplyingTo,
  showTopic,
}: PostCardItemProps) {
  const { store } = usePolycentricContext();
  const post = useStore(store, (s) => s.posts[postId]);

  useEffect(() => {
    store.getState().ensurePostMetadataLoaded(postId);
  }, [store, postId]);

  const handleLike = useCallback(() => {
    store.getState().likePost(postId);
  }, [store, postId]);

  const handleDislike = useCallback(() => {
    store.getState().dislikePost(postId);
  }, [store, postId]);

  const authorName = useUsername(post?.decoded.authorPublicKey ?? EMPTY_PUBKEY);
  const replyingToName = useUsername(
    post?.decoded.parentAuthorPublicKey ?? EMPTY_PUBKEY,
  );

  if (!post) return null;

  const liked = post.myOpinion === types.Opinion.LIKE;
  const disliked = post.myOpinion === types.Opinion.DISLIKE;

  return (
    <PostCard
      content={post.decoded.content}
      authorName={authorName}
      authorPublicKey={post.decoded.authorPublicKey}
      timestamp={post.decoded.timestamp}
      replyingToName={replyingToName}
      hasParent={!!post.decoded.parentAuthorPublicKey}
      likes={post.stats.likes}
      dislikes={post.stats.dislikes}
      comments={post.stats.comments}
      liked={liked}
      disliked={disliked}
      onPress={onPress}
      onAuthorPress={onAuthorPress}
      onReply={onReply}
      onReplyingToPress={onReplyingToPress}
      onLike={handleLike}
      onDislike={handleDislike}
      hideReplyingTo={hideReplyingTo}
      showTopic={showTopic}
    />
  );
}
