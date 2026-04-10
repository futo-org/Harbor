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
import {
  useExploreFeed,
  useFollowingFeed,
  decodePostEvent,
  publicKeyToStringURLSafe,
} from '@/src/common/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { openCompose, Routes, TAB_BAR_HEIGHT } from '@/src/common/constants';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { WideShellMode, useWideShellMode } from '@/src/features/wideshell';

export default function FeedTabScreen() {
  const wideShellMode = useWideShellMode();
  const showComposeFab = !isWeb && wideShellMode !== WideShellMode.Full;

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
    router.push(Routes.tabs.post(postId));
  }, []);

  const handleAuthorPress = useCallback((publicKey: types.PublicKey) => {
    router.push(Routes.tabs.profile(publicKeyToStringURLSafe(publicKey)));
  }, []);

  const handleReply = useCallback((signedEvent: types.SignedEvent) => {
    const decoded = decodePostEvent(signedEvent);
    if (!decoded?.id) return;
    openCompose(decoded.id);
  }, []);

  const handleFabPress = () => {
    openCompose();
  };

  const tabBarHidden = wideShellMode !== WideShellMode.Narrow;
  const bottomPadding = tabBarHidden ? 32 : TAB_BAR_HEIGHT * 2.5;

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
    </Screen>
  );
}
