import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { openCompose } from '@/src/common/constants';
import {
  PostData,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import useReposts from '../hooks/useReposts';
import PostActionButton from './PostActionButton';

type RepostButtonProps = { post: PostData };

export default function RepostButton({ post }: RepostButtonProps) {
  const client = usePolycentric();
  const hasReposted = useReposts((s) => s.hasReposted(post.id));
  const addRepost = useReposts((s) => s.addRepost);
  const removeRepost = useReposts((s) => s.removeRepost);

  const onQuotePress = () => {
    openCompose({ quote: post.id });
  };

  // When already reposted, the button directly removes the repost
  if (hasReposted) {
    return (
      <View style={[Atoms.flex_1]}>
        <PostActionButton
          icon="repost"
          active
          color="positive_500"
          onPress={() => {
            void removeRepost(client, post.id);
          }}
        />
      </View>
    );
  }

  // Otherwise, a dropdown
  return (
    <View style={[Atoms.flex_1]}>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <PostActionButton icon="repost" color="positive_500" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item
            onPress={() => {
              void addRepost(client, post);
            }}
          >
            <Icon name="repost" color="neutral_500" size={16} />
            <Text fontWeight="bold">Repost</Text>
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
