import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/common/components/layout';
import { Fab } from '@/src/common/components';
import { Text } from '@/src/common/components/primitives';
import { ComposerInput } from '@/src/features/composer';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { openCompose } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import FeedList from './FeedList';

const ListHeader = () => {
  return (
    <>
      {!isWeb ? <Screen.Topbar right={<TopbarSettingsButton />} /> : null}
      {isWeb && <ComposerInput />}
    </>
  );
};

export default function FeedScreen() {
  const showComposeFab = !isWeb;

  const [enabled, setEnabled] = useState<boolean>(false);
  const feed = useFollowingFeed({ enabled });

  useFocusEffect(
    useCallback(() => {
      setEnabled(true);
    }, [setEnabled]),
  );

  useFocusedRefresh(feed.refresh);

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
        <FeedList feed={feed} ListHeaderComponent={ListHeader} />
        {showComposeFab ? (
          <Fab
            onPress={openCompose}
            icon={() => <Ionicons name="add" size={32} color="white" />}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
