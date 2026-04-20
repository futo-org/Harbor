import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/common/components/layout';
import { View } from 'react-native';
import { Fab, HorizontalScrollGroup } from '@/src/common/components';
import {
  IdentityHeader,
  FeedChip,
  FeedViewer,
  type FeedType,
} from '@/src/features/post';
import { useExploreFeed } from './hooks/useExploreFeed';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { openCompose } from '@/src/common/constants';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';

export default function FeedScreen() {
  const showComposeFab = !isWeb;

  const [selectedFeed, setSelectedFeed] = useState<FeedType>('explore');

  const exploreFeed = useExploreFeed({
    enabled: selectedFeed === 'explore',
  });
  const followingFeed = useFollowingFeed({
    enabled: selectedFeed === 'following',
  });

  const currentFeed =
    selectedFeed === 'following' ? followingFeed : exploreFeed;

  const handleFabPress = () => {
    openCompose();
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
          <IdentityHeader />
          <View style={Atoms.mt_lg}>
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
          </View>
        </View>
        <View style={[Atoms.flex_1, Atoms.mt_md]}>
          <FeedViewer
            key={selectedFeed}
            items={currentFeed.items}
            isLoading={currentFeed.isLoading}
            error={currentFeed.error}
            onRefresh={currentFeed.refresh}
            onEndReached={currentFeed.loadMore}
            hasMore={currentFeed.hasMore}
            bottomPadding={0}
          />
        </View>
        {showComposeFab ? (
          <Fab
            title="New Post"
            onPress={handleFabPress}
            icon={() => <Ionicons name="add-circle" size={22} color="white" />}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
