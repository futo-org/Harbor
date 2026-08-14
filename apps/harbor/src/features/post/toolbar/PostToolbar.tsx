import { openCompose } from '@/src/common/constants';
import { memo } from 'react';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import PostActionButton from './PostActionButton';
import PostReactionButton from './PostReactionButton';
import PostReactionOutput from './PostReactionOutput';
import RepostButton from './RepostButton';

export type PostToolbarProps = {
  post: PostData;
  /** Optional style override applied to the toolbar container. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The row of reply / vote actions underneath a post's body. Pure
 * presentation — takes callbacks for each action.
 */
export const PostToolbar = memo(function PostToolbar({
  post,
  style,
}: PostToolbarProps) {
  const onReplyPress = () => {
    openCompose({ replyTo: post.id });
  };

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_start,
        Atoms.gap_sm,
        Atoms.pt_2xs,
        { marginLeft: -8 },
        style,
      ]}
    >
      <PostReactionButton post={post} />
      <PostActionButton
        icon="reply"
        onPress={onReplyPress}
        color={'primary_500'}
        count={post.replyCount}
      />
      <RepostButton post={post} />
      <View style={[Atoms.flex_1]} />
      <PostReactionOutput post={post} />
    </View>
  );
});
