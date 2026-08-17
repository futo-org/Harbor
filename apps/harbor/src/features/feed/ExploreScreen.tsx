import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { Text } from '@/src/common/components/primitives';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { Atoms } from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import type { ListRef } from '@/src/common/components/List';
import { ComposerInput } from '../composer';
import { SearchBar } from '../search/SearchBar';
import FeedList from './FeedList';
import type { ExploreSort } from './hooks/feedCache';
import { useExploreFeed } from './hooks/useExploreFeed';
import { Tabs } from '@/src/common/components/Tabs';

type ListHeaderProps = {
  sort: ExploreSort;
  onSortPress: (sort: ExploreSort) => void;
};

const ListHeader = ({ sort, onSortPress }: ListHeaderProps) => {
  return (
    <>
      {!isWeb ? (
        <Screen.Topbar
          center={<SearchBar />}
          right={<TopbarSettingsButton />}
        />
      ) : null}

      <Tabs>
        <Tabs.Tab active={sort === 'top'} onPress={() => onSortPress('top')}>
          Top
        </Tabs.Tab>
        <Tabs.Tab
          active={sort === 'latest'}
          onPress={() => onSortPress('latest')}
        >
          Latest
        </Tabs.Tab>
      </Tabs>

      {isWeb && <ComposerInput />}
    </>
  );
};

export default function ExploreScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  const enabled = useEagerLoad();
  const [sort, setSort] = useState<ExploreSort>('top');
  const feed = useExploreFeed({ sort, enabled });
  const listRef = useRef<ListRef>(null);
  const { refresh } = feed;

  const onSortPress = useCallback(
    (next: ExploreSort) => {
      listRef.current?.scrollToTop();
      // Each sort is its own query, so switching already shows the other list.
      if (next === sort) refresh();
      else setSort(next);
    },
    [sort, refresh],
  );

  const header = useCallback(
    () => <ListHeader sort={sort} onSortPress={onSortPress} />,
    [sort, onSortPress],
  );

  // Re-tapping the active navigation tab scrolls to the top and refreshes.
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
        <FeedList
          ref={listRef}
          feed={feed}
          HeaderComponent={header}
          initialHeaderHeight={isWeb ? 0 : TOPBAR_HEIGHT}
        />
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
