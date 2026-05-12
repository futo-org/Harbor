import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/common/components/layout';
import { Fab } from '@/src/common/components';
import { Text } from '@/src/common/components/primitives';
import { FeedViewer } from '@/src/features/post';
import { ComposerInput } from '@/src/features/composer';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { openCompose } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { Atoms, useTheme } from '@/src/common/theme';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useState } from 'react';

const ListHeader = () => (
  <>
    {!isWeb ? <Screen.Topbar /> : null}
    <ComposerInput />
  </>
);

export default function FeedScreen() {
  const { theme } = useTheme();
  const showComposeFab = !isWeb;

  const [enabled, setEnabled] = useState<boolean>(false);
  const feed = useFollowingFeed({ enabled });

  useFocusEffect(() => {
    setEnabled(true);
  });

  if (feed.error) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <View
            style={[
              Atoms.flex_1,
              Atoms.items_center,
              Atoms.justify_center,
              Atoms.p_lg,
            ]}
          >
            <Text color="neutral_500">Failed to load feed</Text>
          </View>
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <FeedViewer
          keyExtractor={(item) => item.id}
          data={feed.items}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            !feed.isLoading ? (
              <View
                style={[
                  Atoms.flex_1,
                  Atoms.items_center,
                  Atoms.justify_center,
                  Atoms.p_lg,
                ]}
              >
                <Text color="neutral_500">No posts yet</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            feed.hasMore && feed.items.length > 0 ? (
              <View style={[Atoms.items_center, Atoms.p_lg]}>
                <ActivityIndicator
                  size="small"
                  color={theme.palette.neutral_500}
                  accessibilityLabel="Loading more posts"
                />
              </View>
            ) : null
          }
          onEndReached={feed.hasMore ? feed.loadMore : undefined}
          onEndReachedThreshold={0.5}
          refreshControl={
            !isWeb ? (
              <RefreshControl
                refreshing={feed.isLoading}
                onRefresh={feed.refresh}
              />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
        />
        {showComposeFab ? (
          <Fab
            title="New Post"
            onPress={openCompose}
            icon={() => <Ionicons name="add-circle" size={22} color="white" />}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
