import Icon from '@/src/common/components/Icon';
import {
  getVariantStyle as getButtonVariantStyle,
  textColorMap as buttonTextColorMap,
} from '@/src/common/components/primitives/Button';
import {
  type TextVariant,
  type TextVariantSize,
  VARIANT_CONFIG,
} from '@/src/common/components/primitives/Text';
import { Atoms, useTheme } from '@/src/common/theme';
import { useOptionalProfileContext } from '@/src/features/profile/ProfileContext';
import { View } from 'react-native';
import useFollows from './hooks/useFollows';

const ICON_BUBBLE_PADDING = 2;

const ICON_SIZE_BY_TEXT_SIZE: Record<TextVariantSize, number> = {
  lg: 14,
  md: 12,
  xs: 10,
};

/** Rendered by `Username` next to every display name. */
export function FollowingBadge({
  identity,
  variant,
}: {
  identity: string | null;
  variant: TextVariant;
}) {
  const { theme } = useTheme();
  const following = useIsFollowingBadgeShown(identity);

  if (!following) return null;

  const size = ICON_SIZE_BY_TEXT_SIZE[VARIANT_CONFIG[variant].size];
  // Fixed square box, since the glyph's own box isn't square.
  const diameter = size + 2 * ICON_BUBBLE_PADDING;

  return (
    <View
      style={[
        Atoms.align_center,
        Atoms.justify_center,
        Atoms.flex_shrink_0,
        Atoms.rounded_full,
        {
          width: diameter,
          height: diameter,
          // Match the active FollowButton.
          backgroundColor: getButtonVariantStyle(theme, 'secondary')
            .backgroundColor,
        },
      ]}
    >
      <Icon
        name="people"
        size={size}
        color={buttonTextColorMap.secondary}
        accessibilityLabel="Following"
      />
    </View>
  );
}

/**
 * Whether to mark `identity` as followed. Always false on that identity's own
 * profile screen, where the Follow button already shows the state.
 */
function useIsFollowingBadgeShown(identity: string | null): boolean {
  const profileIdentity = useOptionalProfileContext()?.identityKey ?? null;
  const isOnOwnProfile = !!identity && identity === profileIdentity;

  return useFollows((state) =>
    identity && !isOnOwnProfile ? state.isFollowing(identity) : false,
  );
}
