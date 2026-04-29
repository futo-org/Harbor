import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/common/components/layout';
import { Fab } from '@/src/common/components';
import { FeedViewer, type FeedType } from '@/src/features/post';
import { ComposerInput } from '@/src/features/composer';
import { useExploreFeed } from './hooks/useExploreFeed';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { openCompose } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { usePathname } from 'expo-router';

function feedTypeFromPath(pathname: string): FeedType {
  // The /feed route shows the following feed; /explore is the public feed.
  // Default to explore so any unrelated caller gets a sensible view.
  return pathname.startsWith('/feed') ? 'following' : 'explore';
}

export default function FeedScreen() {
  const showComposeFab = !isWeb;

  const pathname = usePathname();
  const selectedFeed = feedTypeFromPath(pathname);

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
        {selectedFeed === 'following' ? <ComposerInput /> : null}
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
