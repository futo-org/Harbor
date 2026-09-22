import {
  Text,
  type TextVariantSize,
  VARIANT_CONFIG,
} from '@/src/common/components/primitives/Text';
import { useUsername } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { FollowingIcon } from '@/src/features/follow/FollowingIndicator';
import type { FetchMode } from '@polycentric/react-native';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

type UsernameProps = Omit<ComponentProps<typeof Text>, 'children'> & {
  identity: string | null | undefined;
  fallbackName?: string | null;
  fetchMode?: FetchMode;
  /** Off where a Follow button nearby already shows the state. */
  showFollowing?: boolean;
};

const FOLLOWING_ICON_SIZE: Record<TextVariantSize, number> = {
  lg: 12,
  md: 10,
  xs: 8,
};

/**
 * A user's display name with the following indicator attached. Every display
 * name in the app renders through this so the indicator lives in one place.
 * Text props pass straight through to `Text`.
 */
export function Username({
  identity,
  fallbackName,
  fetchMode,
  numberOfLines = 1,
  showFollowing = true,
  variant = 'body',
  style,
  ...textProps
}: UsernameProps) {
  const name = useUsername(identity, { fallbackName, fetchMode });

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_2xs,
        Atoms.flex_shrink_1,
      ]}
    >
      {name ? (
        <Text
          {...textProps}
          variant={variant}
          numberOfLines={numberOfLines}
          style={[Atoms.flex_shrink_1, style]}
        >
          {name}
        </Text>
      ) : null}
      {showFollowing ? (
        <FollowingIcon
          identity={identity ?? null}
          size={FOLLOWING_ICON_SIZE[VARIANT_CONFIG[variant].size]}
        />
      ) : null}
    </View>
  );
}
