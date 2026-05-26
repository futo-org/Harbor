import { openCompose } from '@/src/common/constants';
import { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import usePostActions from '../hooks/usePostActions';
import PostActionButton from './PostActionButton';
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

  const {} = usePostActions(post);

  const reposted = false;
  const reaction = null;

  const onRepostPress = () => {};

  const onReplyPress = () => {
    openCompose({ replyTo: post.id });
  };

  const onReactionPress = () => {};

  const onSharePress = () => {};

  return (
    <View style={[Atoms.flex_row, Atoms.justify_between, style]}>
      <PostActionButton
        icon="chatbubble-outline"
        onPress={onReplyPress}
        color={'neutral_500'}
      />
      <RepostButton post={post} />
      <PostActionButton
        icon={reaction ? 'heart' : 'heart-outline'}
        onPress={onReactionPress}
        color={'negative_500'}
      />
      <PostActionButton icon="share-social-outline" onPress={onSharePress} />
    </View>
  );
}
