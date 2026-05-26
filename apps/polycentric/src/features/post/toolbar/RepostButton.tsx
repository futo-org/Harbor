import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import { openCompose } from '@/src/common/constants';
import { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import usePostActions from '../hooks/usePostActions';
import PostActionButton from './PostActionButton';

type RepostButtonProps = { post: PostData };

export default function RepostButton({ post }: RepostButtonProps) {
  const { theme } = useTheme();
  const { reportAsync } = usePostActions(post);
  const reposted = false;

  const onRepostPress = async () => {
    await reportAsync();
  };

  const onQuotePress = () => {
    openCompose({ quote: post.id });
  };

  return (
    <View style={[Atoms.flex_1]}>
      <DropdownMenu>
        <DropdownMenu.Trigger>
          <PostActionButton
            icon="repeat"
            active={reposted}
            color={'positive_500'}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onPress={onRepostPress}>
            <Ionicons
              name="repeat"
              color={theme.palette.neutral_500}
              size={16}
            />
            <Text>Repost</Text>
          </DropdownMenu.Item>
          <DropdownMenu.Item onPress={onQuotePress}>
            <Ionicons
              name="create"
              color={theme.palette.neutral_500}
              size={16}
            />
            <Text>Quote</Text>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </View>
  );
}
