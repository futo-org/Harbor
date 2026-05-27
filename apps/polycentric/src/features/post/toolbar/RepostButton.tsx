import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { openCompose } from '@/src/common/constants';
import {
  PostData,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import usePostActions from '../hooks/usePostActions';
import PostActionButton from './PostActionButton';

type RepostButtonProps = { post: PostData };

export default function RepostButton({ post }: RepostButtonProps) {
  const { identityKey: currentIdentity } = useCurrentIdentity();
  const { repostAsync, undoRepostAsync } = usePostActions(post);

  const hasReposted = post.repostedBy === currentIdentity;

  const onRepostPress = async () => {
    if (hasReposted) {
      await undoRepostAsync();
    } else {
      await repostAsync();
    }
  };

  const onQuotePress = () => {
    openCompose({ quote: post.id });
  };

  return (
    <View style={[Atoms.flex_1]}>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <PostActionButton
            icon="repost"
            active={hasReposted}
            color={'positive_500'}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
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
        </DropdownMenu.Content>
      </DropdownMenu>
    </View>
  );
}
