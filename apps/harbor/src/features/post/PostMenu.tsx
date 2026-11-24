import { Text } from '@/src/common/components/primitives/Text';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon from '@/src/common/components/Icon';
import { withIdentity } from '@/src/common/lib/authGate';
import { useCopyToClipboard } from '@/src/common/lib/useCopyToClipboard';
import {
  type PostData,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { Alert } from '@/src/common/util/Alert';
import { View } from 'react-native';
import { useEventInfoSheetStore } from '@/src/features/core/event-info/EventInfoSheet';
import { useReportSheetStore } from '../moderation/ReportSheet';
import { buildPostLink } from './buildPostLink';
import usePostActions from './hooks/usePostActions';

type PostMenuProps = {
  post: PostData;
};

export default function PostMenu({ post }: PostMenuProps) {
  const { theme } = useTheme();

  const { identity: currIdentity } = useCurrentIdentity();
  const isPostAuthor = currIdentity?.identityKey === post.identity;

  const { deleteAsync } = usePostActions(post);
  const { copyToClipboard } = useCopyToClipboard({ showToast: true });

  const openReportSheet = useReportSheetStore((s) => s.openFor);
  const openEventInfoSheet = useEventInfoSheetStore((s) => s.openFor);

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
              (hovered || pressed) && theme.atoms.box.raised.bg,
            ]}
          >
            <Icon name="more" color="muted" size={16} />
          </View>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {/* Copy Link */}
        <DropdownMenu.Item onPress={() => copyToClipboard(buildPostLink(post))}>
          <Icon name="copy" color="muted" size={16} />
          <Text variant="secondary" fontWeight="bold">
            Copy Link
          </Text>
        </DropdownMenu.Item>
        {/* Info */}
        <DropdownMenu.Item
          onPress={() => openEventInfoSheet({ signedEvent: post.signedEvent })}
        >
          <Icon name="infoOutline" color="muted" size={16} />
          <Text variant="secondary" fontWeight="bold">
            Post info
          </Text>
        </DropdownMenu.Item>
        {/* Delete  */}
        {isPostAuthor && (
          <DropdownMenu.Item onPress={onDeletePress}>
            <Icon name="trashBin" color="danger" size={16} />
            <Text variant="secondary" fontWeight="bold" color="danger">
              Delete
            </Text>
          </DropdownMenu.Item>
        )}
        {/* Report */}
        {!isPostAuthor && (
          <DropdownMenu.Item
            onPress={() => withIdentity(() => openReportSheet(post.id))}
          >
            <Icon name="flag" color="muted" size={16} />
            <Text variant="secondary" fontWeight="bold">
              Report
            </Text>
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
