import { type ComponentProps, useMemo } from 'react';
import { useAvatarSizeRequest } from './Avatar';
import AvatarEdit from './AvatarEdit';
import {
  identiconUrl,
  pickImageVariant,
  usePolycentric,
} from '../../lib/polycentric-hooks';
import { useProfile } from '@/src/features/profile/hooks/useProfile';

type ProfileEditAvatarProps = {
  identityKey: string;
} & Omit<ComponentProps<typeof AvatarEdit>, 'defaultUri'>;

/**
 * Edit-mode counterpart to {@link ProfileAvatar}: seeds the image picker with
 * the identity's current avatar (best-fitting variant from the profile's
 * `avatar` ImageSet, falling back to a Dicebear identicon) before the user
 * chooses a replacement.
 */
export function ProfileEditAvatar({
  identityKey,
  size = 'md',
  ...rest
}: ProfileEditAvatarProps) {
  const profile = useProfile(identityKey);
  const client = usePolycentric();
  const { minPixels } = useAvatarSizeRequest(size);

  const uri = useMemo(() => {
    const variant = pickImageVariant(profile.avatar, minPixels);
    if (variant?.blob?.digest) {
      const url = client.blobUrl(variant.blob.digest);
      if (url) return url;
    }

    // Leave size as default for identicons, so that we don't
    // spam reqests as the user zooms in/out.
    return identiconUrl(identityKey);
  }, [profile.avatar, client, identityKey, minPixels]);

  return <AvatarEdit {...rest} size={size} defaultUri={uri} />;
}
