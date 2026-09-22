import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useOptionalProfileContext } from '@/src/features/profile/ProfileContext';
import { View } from 'react-native';
import useFollows from './hooks/useFollows';

/** Full badge, rendered by `IdentityTagOrFollowing` in place of the short id. */
export function FollowingBadge() {
  const { theme } = useTheme();

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

/** Compact variant, rendered by `ProfileName` next to every display name. */
export function FollowingIcon({
  identity,
  size,
}: {
  identity: string | null;
  size: number;
}) {
  const following = useIsFollowingIndicatorShown(identity);

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

/**
 * Whether to mark `identity` as followed. Always false for the user's own
 * identity and on that identity's profile screen, where the Follow button
 * already shows the state.
 */
export function useIsFollowingIndicatorShown(
  identity: string | null | undefined,
): boolean {
  const { isCurrentIdentity } = useCurrentIdentity();
  const profileIdentity = useOptionalProfileContext()?.identityKey ?? null;
  const isHiddenForIdentity =
    !identity || isCurrentIdentity(identity) || identity === profileIdentity;

  return useFollows((state) =>
    !isHiddenForIdentity ? state.isFollowing(identity) : false,
  );
}
