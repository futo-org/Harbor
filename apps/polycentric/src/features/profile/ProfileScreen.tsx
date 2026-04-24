import { Screen } from '@/src/common/components/layout';
import { useTheme } from '@/src/common/theme';
import { useAuthorFeed } from '@/src/features/feed/hooks/useAuthorFeed';
import { useLikesFeed } from '@/src/features/feed/hooks/useLikesFeed';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
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

  const isAbortedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isAbortedRef.current = false;
      return () => {
        isAbortedRef.current = true;
      };
    }, []),
  );

  const authorFeed = useAuthorFeed(identityKey ?? undefined, undefined, {
    getIsAborted: () => isAbortedRef.current,
  });
  const likesFeed = useLikesFeed({
    enabled: isSelf,
    getIsAborted: () => isAbortedRef.current,
  });

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const tabs = isSelf
    ? [
        { key: 'posts', feed: authorFeed, bottomPadding: 40 },
        { key: 'likes', feed: likesFeed, bottomPadding: 40 },
      ]
    : [{ key: 'posts', feed: authorFeed, bottomPadding: 40 }];

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ProfileHeader
          bannerColors={[
            theme.palette.background_secondary,
            theme.palette.background_primary,
          ]}
          onBack={handleBack}
        />
        <ProfileFeedSwitcher tabs={tabs} activeKey={activeFeed} />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
