import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { Text, TextInput } from '@/src/common/components/primitives';
import { openCompose } from '@/src/common/constants';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import {
  Atoms,
  BorderRadius,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import type { ListRef } from '@/src/common/components/List';
import { ComposerInput } from '../composer';
import FeedList from './FeedList';
import { useExploreFeed } from './hooks/useExploreFeed';

function SearchBar() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  return (
    <Pressable
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_center,
        Atoms.w_full,
        Atoms.gap_sm,
        Atoms.px_md,
        {
          height: 40,
          borderRadius: BorderRadius.full,
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
      onPress={() => Alert.alert('Search is coming soon.')}
    >
      <Icon name="search" size={16} color="neutral_500" />
      <TextInput
        variant="plain"
        placeholder="Search"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        style={[Atoms.py_0, Atoms.px_0, Atoms.flex_1]}
      />
    </Pressable>
  );
}

const ListHeader = () => {
  return (
    <>
      {!isWeb ? (
        <Screen.Topbar
          center={<SearchBar />}
          right={<TopbarSettingsButton />}
        />
      ) : null}
      {isWeb && <ComposerInput />}
    </>
  );
};

export default function ExploreScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  const [enabled, setEnabled] = useState<boolean>(false);
  const feed = useExploreFeed({ enabled });
  const listRef = useRef<ListRef>(null);

  useFocusEffect(() => {
    setEnabled(true);
  });

  // Re-tapping the active tab scrolls to the top and refreshes.
  const { refresh } = feed;
  useFocusedRefresh(
    useCallback(() => {
      listRef.current?.scrollToTop();
      refresh();
    }, [refresh]),
  );

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
        <FeedList ref={listRef} feed={feed} HeaderComponent={ListHeader} />
        {showComposeFab ? (
          <Fab
            onPress={openCompose}
            icon={() => <Icon name="add" size={32} color="white" />}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
