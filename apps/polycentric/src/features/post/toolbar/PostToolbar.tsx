import { openCompose } from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import usePostActions from '../hooks/usePostActions';
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
export function PostToolbar({ post, style }: PostToolbarProps) {
  const { theme } = useTheme();

  usePostActions(post);

  const onRepostPress = () => {};

  const onReplyPress = () => {
    openCompose({ replyTo: post.id });
  };

  const onSharePress = () => {};

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_start,
        Atoms.gap_md,
        style,
      ]}
    >
      <PostActionButton
        icon="reply"
        onPress={onReplyPress}
        color={'primary_500'}
      />
      <PostReactionButton post={post} />
      <RepostButton post={post} />
      <PostActionButton icon="share" onPress={onSharePress} />
      <View style={[Atoms.flex_1]} />
      <PostReactionOutput post={post} />
    </View>
  );
}
