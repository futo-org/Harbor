import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { openCompose } from '@/src/common/constants';
import {
  type PostData,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { View } from 'react-native';
import useReposts from '../hooks/useReposts';
import PostActionButton from './PostActionButton';

type RepostButtonProps = { post: PostData };

export default function RepostButton({ post }: RepostButtonProps) {
  const client = usePolycentric();
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
        </DropdownMenu.Content>
      </DropdownMenu>
    </View>
  );
}
