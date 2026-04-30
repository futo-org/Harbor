import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/common/components/layout';
import { Fab } from '@/src/common/components';
import { FeedViewer, type FeedType } from '@/src/features/post';
import { useExploreFeed } from './hooks/useExploreFeed';
import { openCompose } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';

export default function ExploreScreen() {
  const showComposeFab = !isWeb;

  const feed = useExploreFeed({
    enabled: true,
  });

  const handleFabPress = () => {
    openCompose();
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <FeedViewer
          items={feed.items}
          isLoading={feed.isLoading}
          error={feed.error}
          onRefresh={feed.refresh}
          onEndReached={feed.loadMore}
          hasMore={feed.hasMore}
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
