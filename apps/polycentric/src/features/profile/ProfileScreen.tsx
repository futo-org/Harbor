import { Screen } from '@/src/common/components/layout';
import { Atoms, useTheme } from '@/src/common/theme';
import { useAuthorFeed } from '@/src/features/feed/hooks/useAuthorFeed';
import { useLikesFeed } from '@/src/features/feed/hooks/useLikesFeed';
import { FeedViewer } from '@/src/features/post';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProfileHeader } from './ProfileHeader';
import { ProfileProvider, useProfileContext } from './ProfileContext';

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
        <View style={[Atoms.flex_1, profileStyles.feedArea]}>
          <View
            style={[
              profileStyles.feedLayer,
              activeFeed !== 'posts' && profileStyles.hidden,
            ]}
          >
            <FeedViewer
              items={authorFeed.items}
              isLoading={authorFeed.isLoading}
              error={authorFeed.error}
              onRefresh={authorFeed.refresh}
              onEndReached={authorFeed.loadMore}
              hasMore={authorFeed.hasMore}
              bottomPadding={40}
            />
          </View>
          {isSelf && (
            <View
              style={[
                profileStyles.feedLayer,
                activeFeed !== 'likes' && profileStyles.hidden,
              ]}
            >
              <FeedViewer
                items={likesFeed.items}
                isLoading={likesFeed.isLoading}
                error={likesFeed.error}
                onRefresh={likesFeed.refresh}
                onEndReached={likesFeed.loadMore}
                hasMore={likesFeed.hasMore}
                bottomPadding={40}
              />
            </View>
          )}
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

const profileStyles = StyleSheet.create({
  feedArea: {
    minHeight: 0,
  },
  feedLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
});
