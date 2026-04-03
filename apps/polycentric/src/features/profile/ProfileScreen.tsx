import { useCallback, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Screen, Box } from '@/src/common/components/layouts';
import { FeedViewer } from '@/src/features/posts';
import { ProfileHeader } from './ProfileHeader';
import {
  useProfileScreenData,
  useProfileEdit,
  publicKeyToStringURLSafe,
} from '@/src/common/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { publicKey: publicKeyParam } = useLocalSearchParams<{
    publicKey: string;
  }>();
  const isAbortedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isAbortedRef.current = false;
      return () => {
        isAbortedRef.current = true;
      };
    }, []),
  );

  const data = useProfileScreenData(publicKeyParam, {
    getIsAborted: () => isAbortedRef.current,
  });
  const edit = useProfileEdit(data.username, data.profile);

  const handlePostPress = useCallback(
    (postId: string) => {
      router.replace(Routes.post(postId));
    },
    [router],
  );

  const handleAuthorPress = useCallback(
    (pk: types.PublicKey) => {
      router.replace(Routes.profile(publicKeyToStringURLSafe(pk)));
    },
    [router],
  );

  return (
    <Screen>
      <Box style={Atoms.flex_1}>
        <ProfileHeader
          data={data}
          edit={edit}
          screenWidth={screenWidth}
          bannerColors={[
            theme.palette.background_secondary,
            theme.palette.background_primary,
          ]}
          onBack={() => router.back()}
        />
        <Box style={[Atoms.flex_1, profileStyles.feedArea]}>
          <Box
            style={[
              profileStyles.feedLayer,
              data.activeFeed !== 'posts' && profileStyles.hidden,
            ]}
          >
            <FeedViewer
              items={data.authorFeed.items}
              isLoading={data.authorFeed.isLoading}
              error={data.authorFeed.error}
              onRefresh={data.authorFeed.refresh}
              onPostPress={handlePostPress}
              onAuthorPress={handleAuthorPress}
              onEndReached={data.authorFeed.loadMore}
              hasMore={data.authorFeed.hasMore}
              bottomPadding={40}
            />
          </Box>
          {data.isSelf && (
            <Box
              style={[
                profileStyles.feedLayer,
                data.activeFeed !== 'likes' && profileStyles.hidden,
              ]}
            >
              <FeedViewer
                items={data.likesFeed.items}
                isLoading={data.likesFeed.isLoading}
                error={data.likesFeed.error}
                onRefresh={data.likesFeed.refresh}
                onPostPress={handlePostPress}
                onAuthorPress={handleAuthorPress}
                onEndReached={data.likesFeed.loadMore}
                hasMore={data.likesFeed.hasMore}
                bottomPadding={40}
              />
            </Box>
          )}
        </Box>
      </Box>
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
