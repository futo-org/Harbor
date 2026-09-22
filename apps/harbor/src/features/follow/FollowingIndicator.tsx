import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
import useFollows from './hooks/useFollows';

/** Compact variant, rendered by `ProfileName` next to every display name. */
export function FollowingIcon({
  identity,
  size = 12,
}: {
  identity: string | null;
  size?: number;
}) {
  const following = useFollows((state) =>
    identity ? state.isFollowing(identity) : false,
  );

  if (!following) return null;

  return (
    <Icon
      name="people"
      size={size}
      color="primary_400"
      accessibilityLabel="Following"
      style={Atoms.flex_shrink_0}
    />
  );
}

export default function FollowingIndicator({ identity }: { identity: string }) {
  const { theme } = useTheme();
  const following = useFollows((state) => state.isFollowing(identity));

  if (!following) return null;

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.flex_shrink_0,
        Atoms.gap_2xs,
        Atoms.px_xs,
        Atoms.rounded_full,
        {
          paddingVertical: 1,
          borderWidth: 1,
          // Match the style to the active FollowButton.
          backgroundColor: withHexOpacity(theme.palette.primary_400, '20'),
          borderColor: withHexOpacity(theme.palette.primary_400, '40'),
        },
      ]}
    >
      <Icon name="people" size={11} color="primary_400" />
      <Text variant="small" color="primary_400" selectable={false}>
        Following
      </Text>
    </View>
  );
}
