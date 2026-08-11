import { Text } from '@/src/common/components/primitives/Text';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import {
  type PostData,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Alert } from '@/src/common/util/Alert';
import { useState } from 'react';
import { View } from 'react-native';
import ReportSheet from '../moderation/ReportSheet';
import usePostActions from './hooks/usePostActions';

type PostMenuProps = {
  post: PostData;
};

export default function PostMenu({ post }: PostMenuProps) {
  const { theme } = useTheme();

  const { identity: currIdentity } = useCurrentIdentity();
  const isPostAuthor = currIdentity?.identityKey === post.identity;

  const { deleteAsync } = usePostActions(post);

  const [showReportSheet, setShowReportSheet] = useState<boolean>(false);

  const onDeletePress = async () => {
    // Wait for confirm
    const userConfirmed = await new Promise((resolve) => {
      Alert.alert(
        'Are you sure?',
        'Confirm you wish to delete this post',
        [
          {
            text: 'Confirm',
            onPress: () => resolve(true),
            style: 'destructive',
          },
          { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
        ],
        { onDismiss: () => resolve(false) },
      );
    });

    if (!userConfirmed) return;
    await deleteAsync();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger hitSlop={16} style={Atoms.outline_none}>
          {({ pressed, hovered }) => (
            <View
              style={[
                Atoms.px_xs,
                Atoms.rounded_full,
                // overflow:hidden forces a rounded clip on native — without it the
                // press background renders with square corners.
                Atoms.overflow_hidden,
                (hovered || pressed) && {
                  backgroundColor: withHexOpacity(
                    theme.palette.neutral_500,
                    '14',
                  ),
                },
              ]}
            >
              <Icon name="more" color="neutral_500" size={16} />
            </View>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {/* Delete  */}
          {isPostAuthor && (
            <DropdownMenu.Item onPress={onDeletePress}>
              <Icon name="trashBin" color="negative_500" size={16} />
              <Text variant="secondary" fontWeight="bold" color="negative_500">
                Delete
              </Text>
            </DropdownMenu.Item>
          )}
          {/* Report */}
          {!isPostAuthor && (
            <DropdownMenu.Item onPress={() => setShowReportSheet(true)}>
              <Icon name="flag" color="neutral_500" size={16} />
              <Text variant="secondary" fontWeight="bold">
                Report
              </Text>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Modals */}
      <ReportSheet
        eventId={post.id}
        open={showReportSheet}
        onClose={() => setShowReportSheet(false)}
      />
    </>
  );
}
