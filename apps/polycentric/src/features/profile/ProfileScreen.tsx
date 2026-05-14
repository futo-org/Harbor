import { Screen } from '@/src/common/components/layout';
import { useTheme } from '@/src/common/theme';
import { useIdentityFeed } from '@/src/features/feed/hooks/useIdentityFeed';
import { useLikesFeed } from '@/src/features/feed/hooks/useLikesFeed';
import {
  router,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
} from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { ProfileHeader } from './ProfileHeader';
import { ProfileProvider, useProfileContext } from './ProfileContext';
import { ProfileFeedSwitcher } from './ProfileFeedSwitcher';

export default function ProfileScreen() {
  const { identityId } = useLocalSearchParams<{ identityId: string }>();

  return (
    <ProfileProvider identityKey={identityId ?? null}>
      <ProfileScreenContent />
    </ProfileProvider>
  );
}

function ProfileScreenContent() {
  const { theme } = useTheme();
  const { identityKey, isSelf, activeFeed } = useProfileContext();

  const isFocused = useIsFocused();

  const isAbortedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isAbortedRef.current = false;
      return () => {
        isAbortedRef.current = true;
      };
    }, []),
  );

  const identityFeed = useIdentityFeed(identityKey ?? undefined, undefined, {
    enabled: isFocused,
    getIsAborted: () => isAbortedRef.current,
  });
  const likesFeed = useLikesFeed({
    enabled: isSelf && isFocused,
    getIsAborted: () => isAbortedRef.current,
  });

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  // Stabilise the props for `memo(ProfileHeader)` — otherwise a fresh
  // array reference on every render defeats the memoisation.
  const bannerColors = useMemo<[string, string]>(
    () => [
      theme.palette.background_secondary,
      theme.palette.background_primary,
    ],
    [theme.palette.background_secondary, theme.palette.background_primary],
  );
  const profileHeader = useMemo(
    () => <ProfileHeader bannerColors={bannerColors} onBack={handleBack} />,
    [bannerColors, handleBack],
  );

  const tabs = useMemo(
    () =>
      isSelf
        ? [
            { key: 'posts', feed: identityFeed, bottomPadding: 40 },
            { key: 'likes', feed: likesFeed, bottomPadding: 40 },
          ]
        : [{ key: 'posts', feed: identityFeed, bottomPadding: 40 }],
    [isSelf, identityFeed, likesFeed],
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ProfileFeedSwitcher
          tabs={tabs}
          activeKey={activeFeed}
          ListHeaderComponent={profileHeader}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
