import { ComponentProps, useMemo } from 'react';
import { Avatar, resolveAvatarSize } from './Avatar';
import {
  identiconUrl,
  pickImageVariant,
  usePolycentric,
} from '../../lib/polycentric-hooks';
import { useProfile } from '@/src/features/profile/hooks/useProfile';

type ProfileAvatarProps = {
  identityKey: string;
} & Omit<ComponentProps<typeof Avatar>, 'source'>;

/**
 * Avatar bound to a Polycentric identity. Picks the best-fitting
 * variant from the profile's `avatar` ImageSet and serves it from the
 * server's reported blob CDN (see `ServerService.GetInfo`). Falls back
 * to a Dicebear identicon when no avatar is set or the CDN hasn't
 * been resolved yet.
 */
export function ProfileAvatar({
  identityKey,
  size = 'md',
  ...rest
}: ProfileAvatarProps) {
  const profile = useProfile(identityKey);
  const client = usePolycentric();
  const pixelSize = resolveAvatarSize(size);

  const uri = useMemo(() => {
    const variant = pickImageVariant(profile.avatar, pixelSize);
    if (variant?.blob?.digest) {
      const url = client.blobUrl(variant.blob.digest);
      if (url) return url;
    }
    return identiconUrl(identityKey, pixelSize);
  }, [profile.avatar, client, identityKey, pixelSize]);

  return <Avatar {...rest} size={size} source={{ uri }} />;
}
