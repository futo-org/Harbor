import { Text } from '@/src/common/components/primitives/Text';
import { useUsername } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { FollowingBadge } from '@/src/features/follow/FollowingBadge';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

type UsernameProps = Omit<ComponentProps<typeof Text>, 'children'> & {
  identity: string | null | undefined;
  fallbackName?: string | null;
  /** Set where a Follow button nearby already shows the state. */
  noFollowingBadge?: boolean;
};

/**
 * Every display name in the app renders through this, so the following
 * indicator lives in one place.
 */
export function Username({
  identity,
  fallbackName,
  numberOfLines = 1,
  noFollowingBadge,
  variant = 'body',
  style,
  ...textProps
}: UsernameProps) {
  const name = useUsername(identity, { fallbackName });

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
      {noFollowingBadge ? null : (
        <FollowingBadge identity={identity ?? null} variant={variant} />
      )}
    </View>
  );
}
