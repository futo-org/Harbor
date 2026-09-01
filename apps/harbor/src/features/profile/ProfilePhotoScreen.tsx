import { Redirect, useLocalSearchParams } from 'expo-router';
import { ImageViewerScreen } from '@/src/common/components/ImageViewer';
import { Routes } from '@/src/common/constants/routes';
import { identiconUrl } from '@/src/common/lib/polycentric-hooks';
import { openWithReturn } from '@/src/common/lib/navigation/openWithReturn';
import { FetchMode, isIdentityKey } from '@polycentric/react-native';
import { useProfile } from './hooks/useProfile';

/**
 * Full-screen viewer for a profile's avatar, mounted by the
 * `/[identityId]/photo` route as a transparentModal over whatever screen
 * pushed it. Loads the profile from the URL param, so a refresh or
 * shared link shows the same image; identities without an avatar get
 * their identicon.
 */
export default function ProfilePhotoScreen() {
  const { identityId } = useLocalSearchParams<{ identityId: string }>();
  const profile = useProfile(identityId, { fetchMode: FetchMode.Default });

  const profileRoute = Routes.tabs.profile(identityId);

  // The URL slot may hold an alias (user@domain) instead of a key; the
  // profile page knows how to resolve those, so let it.
  if (!isIdentityKey(identityId)) {
    return <Redirect href={profileRoute} />;
  }

  // Avatar once the profile loads; identicon if there is none.
  const images = profile.avatar
    ? [profile.avatar]
    : profile.isLoading
      ? []
      : [{ uri: identiconUrl(identityId, 512), aspectRatio: 1 }];

  return <ImageViewerScreen images={images} fallbackHref={profileRoute} />;
}

/** Open the viewer for a profile's avatar (or identicon fallback). */
export function openProfilePhoto(identityKey: string) {
  openWithReturn(Routes.tabs.profilePhoto(identityKey));
}
