import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { withIdentity } from '@/src/common/lib/authGate';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { COLLECTION } from '@polycentric/react-native';
import { useState } from 'react';
import { View } from 'react-native';
import EventInfoSheet from '@/src/features/core/event-info/EventInfoSheet';
import useBlocks from '../block/hooks/useBlocks';
import BanSheet from '../moderation/BanSheet';
import useModerationStatus from '../moderation/hooks/useModerationStatus';
import ReportSheet from '../moderation/ReportSheet';
import { useProfile } from './hooks/useProfile';
import { useProfileContext } from './ProfileContext';

type ProfileMenuProps = {
  onSharePress: () => void;
};

type MenuItem = {
  key: string;
  icon: IconName;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * The "..." context menu on a profile page. Renders nothing until the
 * profile's identity is known.
 */
export default function ProfileMenu({ onSharePress }: ProfileMenuProps) {
  const { theme } = useTheme();
  const client = usePolycentric();
  const { identityKey, isSelf } = useProfileContext();
  const { isModerator } = useModerationStatus();
  const isBlocked = useBlocks((s) => s.isBlocked(identityKey ?? ''));
  const addBlock = useBlocks((s) => s.addBlock);
  const removeBlock = useBlocks((s) => s.removeBlock);

  const [showBanSheet, setShowBanSheet] = useState<boolean>(false);
  const [showInfoSheet, setShowInfoSheet] = useState<boolean>(false);
  // Reports on an identity target its first event.
  const [reportEventId, setReportEventId] = useState<string | null>(null);
  const profileEventId = useProfile(identityKey ?? null).eventId;

  const items: MenuItem[] = [];
  // On your own profile, the header's share button is enough.
  if (identityKey) {
    items.push({
      key: 'share',
      icon: 'share',
      label: 'Share',
      onPress: onSharePress,
    });
  }
  if (isModerator && !isSelf) {
    items.push({
      key: 'ban',
      icon: 'ban',
      label: 'Ban user',
      destructive: true,
      onPress: () => setShowBanSheet(true),
    });
  }
  if (!isSelf && identityKey) {
    items.push({
      key: 'report',
      icon: 'flag',
      label: 'Report',
      // Null only until the profile has loaded.
      onPress: () =>
        withIdentity(() => setReportEventId(profileEventId ?? null)),
    });
    items.push({
      key: 'block',
      icon: isBlocked ? 'personAdd' : 'personRemove',
      label: isBlocked ? 'Unblock user' : 'Block user',
      onPress: () => {
        if (isBlocked) void removeBlock(client, identityKey);
        else void addBlock(client, identityKey);
      },
    });
  }

  if (!identityKey) return null;

  items.push({
    key: 'info',
    icon: 'infoOutline',
    label: 'Profile info',
    onPress: () => setShowInfoSheet(true),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger hitSlop={16} style={Atoms.outline_none}>
          {({ pressed, hovered }) => (
            <View
              style={[
                Atoms.p_xs,
                Atoms.rounded_full,
                // overflow:hidden forces a rounded clip on native — without it
                // the press background renders with square corners.
                Atoms.overflow_hidden,
                (hovered || pressed) && {
                  backgroundColor: withHexOpacity(
                    theme.palette.neutral_500,
                    '14',
                  ),
                },
              ]}
            >
              <Icon name="dotsVertical" color="muted" size={20} />
            </View>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {items.map((item) => (
            <DropdownMenu.Item key={item.key} onPress={item.onPress}>
              <Icon
                name={item.icon}
                color={item.destructive ? 'danger' : 'muted'}
                size={16}
              />
              <Text
                variant="secondary"
                fontWeight="bold"
                color={item.destructive ? 'danger' : undefined}
              >
                {item.label}
              </Text>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Modals */}
      {reportEventId ? (
        <ReportSheet
          eventId={reportEventId}
          open
          onClose={() => setReportEventId(null)}
        />
      ) : null}
      <BanSheet
        identityKey={identityKey}
        open={showBanSheet}
        onClose={() => setShowBanSheet(false)}
      />
      <EventInfoSheet
        source={{ identity: identityKey, collection: COLLECTION.PROFILE }}
        open={showInfoSheet}
        onClose={() => setShowInfoSheet(false)}
      />
    </>
  );
}
