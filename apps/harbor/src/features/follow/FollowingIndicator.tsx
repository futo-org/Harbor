import Icon from '@/src/common/components/Icon';
import { Text } from '@/src/common/components/primitives';
import {
  getVariantStyle as getButtonVariantStyle,
  textColorMap as buttonTextColorMap,
} from '@/src/common/components/primitives/Button';
import { Atoms, useTheme } from '@/src/common/theme';
import { useOptionalProfileContext } from '@/src/features/profile/ProfileContext';
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import useFollows from './hooks/useFollows';

const BUBBLE_BORDER_WIDTH = 1;
const ICON_BUBBLE_PADDING = 2;

/** Full badge, rendered by `IdentityTagOrFollowing` in place of the short id. */
export function FollowingBadge() {
  return (
    <FollowingBubble style={[Atoms.px_xs, { paddingVertical: 1 }]}>
      <Icon name="people" size={12} color={buttonTextColorMap.secondary} />
      <Text
        variant="small"
        color={buttonTextColorMap.secondary}
        selectable={false}
      >
        Following
      </Text>
    </FollowingBubble>
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

  // Fixed square box, since the glyph's own box isn't square.
  const diameter = size + 2 * (ICON_BUBBLE_PADDING + BUBBLE_BORDER_WIDTH);

  return (
    <FollowingBubble
      style={[Atoms.justify_center, { width: diameter, height: diameter }]}
    >
      <Icon
        name="people"
        size={size}
        color={buttonTextColorMap.secondary}
        accessibilityLabel="Following"
      />
    </FollowingBubble>
  );
}

function FollowingBubble({
  style,
  children,
}: {
  style?: ViewStyle | ViewStyle[];
  children: ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.flex_shrink_0,
        Atoms.gap_2xs,
        Atoms.rounded_full,
        { borderWidth: BUBBLE_BORDER_WIDTH },
        // Match the active FollowButton.
        getButtonVariantStyle(theme, 'secondary'),
        style,
      ]}
    >
      {children}
    </View>
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
