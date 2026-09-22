import { Text } from '@/src/common/components/primitives/Text';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';
import {
  FollowingBadge,
  useIsFollowingIndicatorShown,
} from '@/src/features/follow/FollowingIndicator';
import type { ComponentProps } from 'react';

type IdentityTagOrFollowingProps = {
  /** v2 identity id (hex sha256 of the initial Identity content). */
  identity: string | undefined;
  style?: ComponentProps<typeof Text>['style'];
};

/** The shortened identity id, or the Following badge when the identity is followed. */
export function IdentityTagOrFollowing({
  identity,
  style,
}: IdentityTagOrFollowingProps) {
  const following = useIsFollowingIndicatorShown(identity);

  if (following) return <FollowingBadge />;

  return (
    <Text
      variant="secondary"
      color="neutral_500"
      style={[{ fontFamily: 'monospace' }, style]}
    >
      {shortenIdentityId(identity)}
    </Text>
  );
}
