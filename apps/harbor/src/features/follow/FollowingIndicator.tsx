import Icon from '@/src/common/components/Icon';
import {
  getVariantStyle as getButtonVariantStyle,
  textColorMap as buttonTextColorMap,
} from '@/src/common/components/primitives/Button';
import { Atoms, useTheme } from '@/src/common/theme';
import { useOptionalProfileContext } from '@/src/features/profile/ProfileContext';
import { View } from 'react-native';
import useFollows from './hooks/useFollows';

const BUBBLE_BORDER_WIDTH = 1;
const ICON_BUBBLE_PADDING = 2;

/** Rendered by `Username` next to every display name. */
export function FollowingBadge({
  identity,
  size,
}: {
  identity: string | null;
  size: number;
}) {
  const { theme } = useTheme();
  const following = useIsFollowingIndicatorShown(identity);

  if (!following) return null;

  // Fixed square box, since the glyph's own box isn't square.
  const diameter = size + 2 * (ICON_BUBBLE_PADDING + BUBBLE_BORDER_WIDTH);

  return (
    <View
      style={[
        Atoms.align_center,
        Atoms.justify_center,
        Atoms.flex_shrink_0,
        Atoms.rounded_full,
        { width: diameter, height: diameter, borderWidth: BUBBLE_BORDER_WIDTH },
        // Match the active FollowButton.
        getButtonVariantStyle(theme, 'secondary'),
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
function useIsFollowingIndicatorShown(identity: string | null): boolean {
  const profileIdentity = useOptionalProfileContext()?.identityKey ?? null;
  const isOnOwnProfile = !!identity && identity === profileIdentity;

  return useFollows((state) =>
    identity && !isOnOwnProfile ? state.isFollowing(identity) : false,
  );
}
