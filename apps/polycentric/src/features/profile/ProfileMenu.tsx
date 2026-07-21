import { Text } from '@/src/common/components';
import DropdownMenu from '@/src/common/components/DropdownMenu';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { useSettings } from '@/src/common/settings';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
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
  const { isSelf } = useProfileContext();
  const moderatorMode = useSettings((s) => s.moderatorMode);

  const items: MenuItem[] = [];
  if (moderatorMode && !isSelf) {
    items.push({
      key: 'ban',
      icon: 'ban',
      label: 'Ban user',
      destructive: true,
      onPress: () => {
        // TODO: wire up banning once the server supports it.
      },
    });
  }

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger hitSlop={16} style={Atoms.outline_none}>
        {({ pressed, hovered }) => (
          <View
            style={[
              Atoms.p_xs,
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
            <Icon name="more" color="neutral_500" size={20} />
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
  );
}
