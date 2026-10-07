import { type ComponentProps, useMemo } from 'react';
import { Avatar, useAvatarSizeRequest } from './Avatar';
import {
  identiconUrl,
  pickImageVariant,
  usePolycentric,
} from '../../lib/polycentric-hooks';
import { useFallbackUri } from '@/src/common/components/Image';
import { useProfile } from '@/src/features/profile/hooks/useProfile';

type ProfileAvatarProps = {
  identityKey: string;
} & Omit<ComponentProps<typeof Avatar>, 'source'>;

/**
 * Avatar bound to a Polycentric identity. Picks the best-fitting variant
 * from the profile's `avatar` ImageSet, trying each server in turn and
 * falling back to a Dicebear identicon if none serve it.
 */
export function ProfileAvatar({
  identityKey,
  size = 'md',
  ...rest
}: ProfileAvatarProps) {
  const profile = useProfile(identityKey);
  const client = usePolycentric();
  const { displayPixels, minPixels } = useAvatarSizeRequest(size, 0.1);

  const candidates = useMemo(() => {
    const variant = pickImageVariant(profile.avatar, minPixels);
    const blobUris = variant?.blob?.digest
      ? client.blobUrls(variant.blob.digest)
      : [];
    // Until the profile has resolved we don't know whether an avatar
    // exists, so render the empty circle
    if (blobUris.length === 0 && profile.isLoading) return [];
    return [...blobUris, identiconUrl(identityKey, displayPixels)];
  }, [
    profile.avatar,
    profile.isLoading,
    client,
    identityKey,
    displayPixels,
    minPixels,
  ]);

  const { uri, onError } = useFallbackUri(candidates);

  return (
    <Avatar
      {...rest}
      size={size}
      source={uri ? { uri } : undefined}
      // The identity, not the URL
      recyclingKey={identityKey}
      onError={uri ? () => onError(uri) : undefined}
    />
  );
}
