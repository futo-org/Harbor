import { useState, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, Box } from '@/components/layouts';
import {
  CurrIdentityHeader,
  HorizontalScrollGroup,
  FeedChip,
  FeedViewer,
  Fab,
  ComposeSheetInner,
  type FeedType,
} from '@/components';
import {
  useExploreFeed,
  useFollowingFeed,
  useCurrentIdentity,
  usePolycentricContext,
  decodePostEvent,
  publicKeyToStringURLSafe,
} from '@/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { Routes, TAB_BAR_HEIGHT } from '@/constants';
import { useSheet } from '@/lib/sheet';

export default function Feed() {
  const router = useRouter();
  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const { Sheet, present, dismiss } = useSheet();

  const [selectedFeed, setSelectedFeed] = useState<FeedType>('explore');
  const [replyToEvent, setReplyToEvent] = useState<types.SignedEvent | null>(
    null,
  );

  const exploreFeed = useExploreFeed();
  const followingFeed = useFollowingFeed();

  const currentFeed =
    selectedFeed === 'following' ? followingFeed : exploreFeed;

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(Routes.post(postId));
    },
    [router],
  );

  const handleAuthorPress = (publicKey: types.PublicKey) => {
    router.push(Routes.profile(publicKeyToStringURLSafe(publicKey)));
  };

  const handlePostCreated = useCallback(
    (signedEvent: types.SignedEvent) => {
      currentFeed.refresh();
      const decoded = decodePostEvent(signedEvent);
      if (decoded) {
        store.getState().ingestPost(decoded.id, signedEvent, decoded);
        router.push(Routes.post(decoded.id));
      }
    },
    [currentFeed, router, store],
  );

  const handleReply = useCallback(
    (signedEvent: types.SignedEvent) => {
      setReplyToEvent(signedEvent);
      present();
    },
    [present],
  );

  const handleFabPress = () => {
    setReplyToEvent(null);
    present();
  };

  const bottomPadding = TAB_BAR_HEIGHT * 2.5;

  return (
    <Screen>
      <Box marginHorizontal="lg" marginTop="lg">
        <CurrIdentityHeader />
        <Box marginTop="lg">
          <HorizontalScrollGroup>
            <FeedChip
              type="explore"
              title="Explore"
              isSelected={selectedFeed === 'explore'}
              onPress={() => setSelectedFeed('explore')}
            />
            <FeedChip
              type="following"
              title="Following"
              isSelected={selectedFeed === 'following'}
              onPress={() => setSelectedFeed('following')}
            />
          </HorizontalScrollGroup>
        </Box>
      </Box>
      <Box flex={1} marginTop="md">
        <Box
          style={[
            styles.feedLayer,
            selectedFeed !== 'explore' && styles.hidden,
          ]}
        >
          <FeedViewer
            items={exploreFeed.items}
            isLoading={exploreFeed.isLoading}
            error={exploreFeed.error}
            onRefresh={exploreFeed.refresh}
            onPostPress={handlePostPress}
            onAuthorPress={handleAuthorPress}
            onReply={handleReply}
            onEndReached={exploreFeed.loadMore}
            hasMore={exploreFeed.hasMore}
            bottomPadding={bottomPadding}
            showTopic={false}
          />
        </Box>
        <Box
          style={[
            styles.feedLayer,
            selectedFeed !== 'following' && styles.hidden,
          ]}
        >
          <FeedViewer
            items={followingFeed.items}
            isLoading={followingFeed.isLoading}
            error={followingFeed.error}
            onRefresh={followingFeed.refresh}
            onPostPress={handlePostPress}
            onAuthorPress={handleAuthorPress}
            onReply={handleReply}
            onEndReached={followingFeed.loadMore}
            hasMore={followingFeed.hasMore}
            bottomPadding={bottomPadding}
            showTopic={false}
          />
        </Box>
      </Box>
      <Fab
        title="New Post"
        onPress={handleFabPress}
        icon={() => <Ionicons name="add-circle" size={22} color="white" />}
      />
      <Sheet detents={[0.82]}>
        <ComposeSheetInner
          dismiss={dismiss}
          onPostCreated={handlePostCreated}
          onAvatarPress={() => {
            if (myPublicKey) handleAuthorPress(myPublicKey);
          }}
          replyToEvent={replyToEvent}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
