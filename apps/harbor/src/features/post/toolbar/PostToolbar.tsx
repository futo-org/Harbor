import {
  openCompose,
  POLYCENTRIC_APP_URL,
  Routes,
} from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, useTheme } from '@/src/common/theme';
import * as Sharing from 'expo-sharing';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import useCanShare from '../hooks/useCanShare';
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
  const canShare = useCanShare();

  usePostActions(post);

  const onRepostPress = () => {};

  const onReplyPress = () => {
    openCompose({ replyTo: post.id });
  };

  const onSharePress = () => {
    const path = Routes.tabs.post(
      post.identity,
      getKeyFingerprint(post.signedBy) ?? '',
      post.sequence,
    );
    void Sharing.shareAsync(`${POLYCENTRIC_APP_URL}${path}`).catch(() => {});
  };

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
        count={post.replyCount}
      />
      <PostReactionButton post={post} />
      <RepostButton post={post} />
      {canShare && <PostActionButton icon="share" onPress={onSharePress} />}
      <View style={[Atoms.flex_1]} />
      <PostReactionOutput post={post} />
    </View>
  );
}
