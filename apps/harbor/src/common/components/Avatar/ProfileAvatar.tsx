import { type ComponentProps, useMemo } from 'react';
import { Avatar, resolveAvatarSize, useAvatarSizeRequest } from './Avatar';
import {
  identiconUrl,
  pickImageVariant,
  usePolycentric,
} from '../../lib/polycentric-hooks';
import Icon from '@/src/common/components/Icon';
import { useFallbackUri } from '@/src/common/components/Image';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { useProfileModeration } from '@/src/features/profile/hooks/useProfileModeration';
import { FollowingBadge } from '@/src/features/follow/FollowingBadge';
import { View } from 'react-native';

type ProfileAvatarProps = {
  identityKey: string;
} & Omit<ComponentProps<typeof Avatar>, 'source'>;

/**
 * Following badge diameter for an avatar of `size` logical pixels. Capped so
 * the glyph matches a small button's 16px icon on large avatars.
 */
function badgeSize(size: number) {
  return Math.min(24, Math.max(12, Math.round(size * 0.4)));
}

/**
 * Avatar bound to a Polycentric identity. Picks the best-fitting variant
 * from the profile's `avatar` ImageSet, trying each server in turn and
 * falling back to a Dicebear identicon if none serve it. Shows the
 * following badge on the bottom-right corner.
 */
export function ProfileAvatar({
  identityKey,
  size = 'md',
  ...rest
}: ProfileAvatarProps) {
  const profile = useProfile(identityKey);
  const { obscured } = useProfileModeration(identityKey);
  const client = usePolycentric();
  const { minPixels } = useAvatarSizeRequest(size, 0.1);

  const candidates = useMemo(() => {
    const variant = pickImageVariant(profile.avatar, minPixels);
    const blobUris = variant?.blob?.digest
      ? client.blobUrls(variant.blob.digest)
      : [];
    // Until the profile has resolved we don't know whether an avatar
    // exists, so render the empty circle
    if (blobUris.length === 0 && profile.isLoading) return [];

    // Leave size as default for identicons, so that we don't
    // spam requests as the user zooms in/out.
    return [...blobUris, identiconUrl(identityKey)];
  }, [profile.avatar, profile.isLoading, client, identityKey, minPixels]);

  const { uri, onError } = useFallbackUri(candidates);

  const pixels = resolveAvatarSize(size);
  const badge = badgeSize(pixels);
  // Centre the badge on the circle's rim at 45 degrees, where the rim sits
  // inside the square's corner by r * (1 - 1/sqrt 2).
  const overhang = Math.round(badge / 2 - (pixels / 2) * (1 - Math.SQRT1_2));

  return (
    <View style={{ width: pixels, height: pixels }}>
      <Avatar
        {...rest}
        size={size}
        // A warned profile shows the empty circle, not a blur.
        source={uri && !obscured ? { uri } : undefined}
        // The identity, not the URL
        recyclingKey={identityKey}
        onError={uri ? () => onError(uri) : undefined}
      />
      {obscured ? (
        <View
          pointerEvents="none"
          style={[
            Atoms.absolute,
            Atoms.inset_0,
            Atoms.align_center,
            Atoms.justify_center,
          ]}
        >
          <Icon
            name="infoOutline"
            color="neutral_500"
            size={Math.round(pixels / 2)}
          />
        </View>
      ) : null}
      <FollowingBadge
        identity={identityKey}
        size={badge}
        style={{ position: 'absolute', right: -overhang, bottom: -overhang }}
      />
    </View>
  );
}
