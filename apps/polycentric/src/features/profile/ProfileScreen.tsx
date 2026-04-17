import { Screen } from '@/src/common/components/layout';
import { Routes } from '@/src/common/constants';
import {
  decodePostEvent,
  publicKeyToStringURLSafe,
  useProfileEdit,
  useProfileScreenData,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { FeedViewer } from '@/src/features/post';
import { types } from '@polycentric/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProfileHeader } from './ProfileHeader';

export default function ProfileScreen() {
  const { theme } = useTheme();
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

  const handlePostPress = useCallback((postId: string) => {
    router.replace(Routes.tabs.post(postId));
  }, []);

  const handleAuthorPress = useCallback((pk: types.PublicKey) => {
    router.replace(Routes.tabs.profile(publicKeyToStringURLSafe(pk)));
  }, []);

  const handleReply = useCallback((signedEvent: types.SignedEvent) => {
    const decoded = decodePostEvent(signedEvent);
    if (!decoded?.id) return;
    router.push(Routes.tabs.post.reply(decoded.id, decoded.id));
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ProfileHeader
          data={data}
          edit={edit}
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
              onReply={handleReply}
              onEndReached={data.authorFeed.loadMore}
              hasMore={data.authorFeed.hasMore}
              bottomPadding={40}
            />
          </View>
          {data.isSelf && (
            <View
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
                onReply={handleReply}
                onEndReached={data.likesFeed.loadMore}
                hasMore={data.likesFeed.hasMore}
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
