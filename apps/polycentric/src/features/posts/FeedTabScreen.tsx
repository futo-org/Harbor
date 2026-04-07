import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen, Box } from '@/src/common/components/layouts';
import { Fab, HorizontalScrollGroup } from '@/src/common/components';
import {
  CurrIdentityHeader,
  FeedChip,
  FeedViewer,
  type FeedType,
} from '@/src/features/posts';
import { ComposeSheetInner } from '@/src/features/composer/ComposeSheetInner';
import {
  useExploreFeed,
  useFollowingFeed,
  useCurrentIdentity,
  usePolycentricContext,
  decodePostEvent,
  publicKeyToStringURLSafe,
} from '@/src/common/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { Routes, TAB_BAR_HEIGHT } from '@/src/common/constants';
import { useSheet } from '@/src/common/lib/sheet';
import { Atoms } from '@/src/common/theme';

export default function FeedTabScreen() {
  const showComposeFab = true;
  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const { Sheet, present, dismiss } = useSheet();

  const [replyToEvent, setReplyToEvent] = useState<types.SignedEvent | null>(
    null,
  );
  const [selectedFeed, setSelectedFeed] = useState<FeedType>('explore');

  const exploreFeed = useExploreFeed({
    enabled: selectedFeed === 'explore',
  });
  const followingFeed = useFollowingFeed({
    enabled: selectedFeed === 'following',
  });

  const currentFeed =
    selectedFeed === 'following' ? followingFeed : exploreFeed;

  const handlePostPress = useCallback((postId: string) => {
    router.push(Routes.post(postId));
  }, []);

  const handleAuthorPress = useCallback((publicKey: types.PublicKey) => {
    router.push(Routes.profile(publicKeyToStringURLSafe(publicKey)));
  }, []);

  const dismissSheet = useCallback(async () => {
    await dismiss();
    setReplyToEvent(null);
  }, [dismiss]);

  const handlePostCreated = useCallback(
    async (signedEvent: types.SignedEvent) => {
      currentFeed.refresh();
      const decoded = decodePostEvent(signedEvent);
      if (decoded) {
        store.getState().ingestPost(decoded.id, signedEvent, decoded);
        router.push(Routes.post(decoded.id));
      }
      await dismissSheet();
    },
    [currentFeed, store, dismissSheet],
  );

  const handleReply = useCallback(
    (signedEvent: types.SignedEvent) => {
      const decoded = decodePostEvent(signedEvent);
      if (!decoded?.id) return;
      setReplyToEvent(signedEvent);
      void present();
    },
    [present],
  );

  const handleFabPress = () => {
    setReplyToEvent(null);
    void present();
  };

  const bottomPadding = TAB_BAR_HEIGHT * 2.5;

  return (
    <Screen>
      <Box style={[Atoms.mx_lg, Atoms.mt_lg]}>
        <CurrIdentityHeader />
        <Box style={Atoms.mt_lg}>
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
      <Box style={[Atoms.flex_1, Atoms.mt_md]}>
        <FeedViewer
          key={selectedFeed}
          items={currentFeed.items}
          isLoading={currentFeed.isLoading}
          error={currentFeed.error}
          onRefresh={currentFeed.refresh}
          onPostPress={handlePostPress}
          onAuthorPress={handleAuthorPress}
          onReply={handleReply}
          onEndReached={currentFeed.loadMore}
          hasMore={currentFeed.hasMore}
          bottomPadding={bottomPadding}
          showTopic={false}
        />
      </Box>
      {showComposeFab ? (
        <Fab
          title="New Post"
          onPress={handleFabPress}
          icon={() => <Ionicons name="add-circle" size={22} color="white" />}
        />
      ) : null}
      <Sheet detents={[0.82]} scrollable>
        <ComposeSheetInner
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
