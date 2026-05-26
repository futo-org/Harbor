import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import {
  PostData,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { useTheme } from '@/src/common/theme';
import { Alert } from '@/src/common/util/Alert';
import { Ionicons } from '@expo/vector-icons';
import usePostActions from './hooks/usePostActions';

type PostMenuProps = {
  post: PostData;
};

export default function PostMenu({ post }: PostMenuProps) {
  const { theme } = useTheme();

  const { identity: currIdentity } = useCurrentIdentity();
  const isPostAuthor = currIdentity?.identityKey === post.identity;

  const { deleteAsync: deleteAsync } = usePostActions(post);

  const onDeletePress = async () => {
    // Wait for confirm
    await new Promise((resolve, reject) => {
      Alert.alert('Are you sure?', 'Confirm you wish to delete this post', [
        { text: 'Confirm', onPress: () => resolve(true), style: 'destructive' },
        { text: 'Cancel', onPress: () => reject(), style: 'cancel' },
      ]);
    });
    await deleteAsync();
  };

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <Ionicons
          name="ellipsis-horizontal"
          color={theme.palette.neutral_500}
          size={16}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {/* Delete  */}
        {isPostAuthor && (
          <DropdownMenu.Item onPress={onDeletePress}>
            <Ionicons
              name="trash-bin"
              color={theme.palette.negative_500}
              size={16}
            />
            <Text variant="secondary" fontWeight="bold" color="negative_500">
              Delete
            </Text>
          </DropdownMenu.Item>
        )}
        {/* Report */}
        {!isPostAuthor && (
          <DropdownMenu.Item onPress={() => Alert.alert('Working on it')}>
            <Ionicons
              name="flag-outline"
              color={theme.palette.neutral_500}
              size={16}
            />
            <Text variant="secondary" fontWeight="bold">
              Report
            </Text>
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
