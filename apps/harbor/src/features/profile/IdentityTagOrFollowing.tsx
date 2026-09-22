import { Text } from '@/src/common/components/primitives/Text';
import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';
import { FollowingBadge } from '@/src/features/follow/FollowingIndicator';
import useFollows from '@/src/features/follow/hooks/useFollows';
import type { ComponentProps } from 'react';

type IdentityTagOrFollowingProps = {
  /** v2 identity id (hex sha256 of the initial Identity content). */
  identity: string | undefined;
  /** Off for the user's own identities or where a Follow button already shows the state. */
  showFollowing?: boolean;
  style?: ComponentProps<typeof Text>['style'];
};

/** The shortened identity id, or the Following badge when the identity is followed. */
export function IdentityTagOrFollowing({
  identity,
  showFollowing = true,
  style,
}: IdentityTagOrFollowingProps) {
  const following = useFollows((state) =>
    showFollowing && identity ? state.isFollowing(identity) : false,
  );

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
