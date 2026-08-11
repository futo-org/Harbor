import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useState } from 'react';
import { View } from 'react-native';
import useBlocks from '../block/hooks/useBlocks';
import BanSheet from '../moderation/BanSheet';
import useModerationStatus from '../moderation/hooks/useModerationStatus';
import { useProfileContext } from './ProfileContext';

type MenuItem = {
  key: string;
  icon: IconName;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * The "..." context menu on a profile page. Renders nothing when no
 * menu items apply to the viewed profile.
 */
export default function ProfileMenu() {
  const { theme } = useTheme();
  const client = usePolycentric();
  const { identityKey, isSelf } = useProfileContext();
  const { isModerator } = useModerationStatus();
  const isBlocked = useBlocks((s) => s.isBlocked(identityKey ?? ''));
  const addBlock = useBlocks((s) => s.addBlock);
  const removeBlock = useBlocks((s) => s.removeBlock);

  const [showBanSheet, setShowBanSheet] = useState<boolean>(false);

  const items: MenuItem[] = [];
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
      key: 'block',
      icon: isBlocked ? 'personAdd' : 'personRemove',
      label: isBlocked ? 'Unblock user' : 'Block user',
      onPress: () => {
        if (isBlocked) void removeBlock(client, identityKey);
        else void addBlock(client, identityKey);
      },
    });
  }

  if (items.length === 0 || !identityKey) return null;

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
              <Icon name="dotsVertical" color="neutral_500" size={20} />
            </View>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {items.map((item) => (
            <DropdownMenu.Item key={item.key} onPress={item.onPress}>
              <Icon
                name={item.icon}
                color={item.destructive ? 'negative_500' : 'neutral_500'}
                size={16}
              />
              <Text
                variant="secondary"
                fontWeight="bold"
                color={item.destructive ? 'negative_500' : undefined}
              >
                {item.label}
              </Text>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Modals */}
      <BanSheet
        identityKey={identityKey}
        open={showBanSheet}
        onClose={() => setShowBanSheet(false)}
      />
    </>
  );
}
