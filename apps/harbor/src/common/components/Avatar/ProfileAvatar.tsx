import { type ComponentProps, useMemo } from 'react';
import { Avatar, resolveAvatarSize, useAvatarSizeRequest } from './Avatar';
import {
  identiconUrl,
  pickImageVariant,
  usePolycentric,
} from '../../lib/polycentric-hooks';
import { useFallbackUri } from '@/src/common/components/Image';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { FollowingBadge } from '@/src/features/follow/FollowingBadge';
import { View } from 'react-native';

type ProfileAvatarProps = {
  identityKey: string;
} & Omit<ComponentProps<typeof Avatar>, 'source'>;

/** Following badge diameter for an avatar of `size` logical pixels. */
function badgeSize(size: number) {
  return Math.min(36, Math.max(12, Math.round(size * 0.4)));
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
  const overhang = Math.round(badge * 0.15);

  return (
    <View style={{ width: pixels, height: pixels }}>
      <Avatar
        {...rest}
        size={size}
        source={uri ? { uri } : undefined}
        // The identity, not the URL
        recyclingKey={identityKey}
        onError={uri ? () => onError(uri) : undefined}
      />
      <FollowingBadge
        identity={identityKey}
        size={badge}
        style={{ position: 'absolute', right: -overhang, bottom: -overhang }}
      />
    </View>
  );
}
