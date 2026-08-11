import { Text } from '@/src/common/components/primitives/Text';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import {
  openCompose,
  POLYCENTRIC_APP_URL,
  Routes,
} from '@/src/common/constants';
import {
  type PostData,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { isIOS } from '@/src/common/util/platform';
import { Share, View } from 'react-native';
import useCanShare from '../hooks/useCanShare';
import useReposts from '../hooks/useReposts';
import PostActionButton from './PostActionButton';

type RepostButtonProps = { post: PostData };

export default function RepostButton({ post }: RepostButtonProps) {
  const client = usePolycentric();
  const canShare = useCanShare();
  const hasReposted = useReposts((s) => s.hasReposted(post.id));
  const addRepost = useReposts((s) => s.addRepost);
  const removeRepost = useReposts((s) => s.removeRepost);

  const onRepostPress = async () => {
    if (hasReposted) {
      await removeRepost(client, post.id);
    } else {
      await addRepost(client, post);
    }
  };

  const onQuotePress = () => {
    openCompose({ quote: post.id });
  };

  const onSharePress = () => {
    const path = Routes.tabs.post(
      post.identity,
      getKeyFingerprint(post.signedBy) ?? '',
      post.sequence,
    );
    const url = `${POLYCENTRIC_APP_URL}${path}`;
    // expo-sharing only shares local files on Android; RN Share handles URLs.
    // iOS shares `url`; Android only reads `message`.
    void Share.share(isIOS ? { url } : { message: url }).catch(() => {});
  };

  return (
    <View style={[]}>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <PostActionButton
            icon="repost"
            active={hasReposted}
            color={'positive_500'}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" side="top">
          <DropdownMenu.Item onPress={onRepostPress}>
            <Icon
              name="repost"
              color={hasReposted ? 'negative_500' : 'neutral_500'}
              size={16}
            />
            <Text
              fontWeight="bold"
              color={hasReposted ? 'negative_500' : 'neutral_900'}
            >
              {hasReposted ? 'Undo Repost' : 'Repost'}
            </Text>
          </DropdownMenu.Item>
          <DropdownMenu.Item onPress={onQuotePress}>
            <Icon name="quote" color="neutral_500" size={16} />
            <Text fontWeight="bold">Quote</Text>
          </DropdownMenu.Item>
          {canShare ? (
            <DropdownMenu.Item onPress={onSharePress}>
              <Icon name="share" color="neutral_500" size={16} />
              <Text fontWeight="bold">Share link</Text>
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu>
    </View>
  );
}
