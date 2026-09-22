import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import {
  getVariantStyle as getButtonVariantStyle,
  textColorMap as buttonTextColorMap,
} from '@/src/common/components/primitives/Button';
import { Atoms, useTheme } from '@/src/common/theme';
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
        { paddingVertical: 1, borderWidth: 1 },
        // Match the active FollowButton.
        getButtonVariantStyle(theme, 'secondary'),
      ]}
    >
      <Icon name="people" size={11} color={buttonTextColorMap.secondary} />
      <Text
        variant="small"
        color={buttonTextColorMap.secondary}
        selectable={false}
      >
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
      color={buttonTextColorMap.secondary}
      accessibilityLabel="Following"
      style={Atoms.flex_shrink_0}
    />
  );
}

/**
 * Whether to mark `identity` as followed. Always false on that identity's own
 * profile screen, where the Follow button already shows the state.
 */
export function useIsFollowingIndicatorShown(
  identity: string | null | undefined,
): boolean {
  const profileIdentity = useOptionalProfileContext()?.identityKey ?? null;
  const isOnOwnProfile = !!identity && identity === profileIdentity;

  return useFollows((state) =>
    identity && !isOnOwnProfile ? state.isFollowing(identity) : false,
  );
}
