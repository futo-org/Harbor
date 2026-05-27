import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import { openCompose } from '@/src/common/constants';
import {
  PostData,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import usePostActions from '../hooks/usePostActions';
import PostActionButton from './PostActionButton';

type RepostButtonProps = { post: PostData };

export default function RepostButton({ post }: RepostButtonProps) {
  const { theme } = useTheme();
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
            icon="repeat"
            active={hasReposted}
            color={'positive_500'}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onPress={onRepostPress}>
            <Ionicons
              name="repeat"
              color={
                hasReposted
                  ? theme.palette.negative_500
                  : theme.palette.neutral_500
              }
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
            <Ionicons
              name="create"
              color={theme.palette.neutral_500}
              size={16}
            />
            <Text fontWeight="bold">Quote</Text>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </View>
  );
}
