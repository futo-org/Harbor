import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { Atoms, useTheme } from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { memo, useCallback, useRef } from 'react';
import { View } from 'react-native';
import type { ListRef } from '@/src/common/components/List';
import { SearchBar } from '../search/SearchBar';
import FeedList from './FeedList';
import { FeedTabs, SORT_TABS } from './FeedTabs';
import type { FeedSortOption, FeedTab } from './hooks/feedCache';
import { useExploreFeed } from './hooks/useExploreFeed';
import { useFeedTab, useFeedTabPress } from './hooks/useFeedTabs';
import { TABS_HEIGHT } from '@/src/common/components/Tabs';

type ListHeaderProps = {
  tab: FeedTab;
  onTabPress: (tab: FeedTab) => void;
};

const ListHeader = memo(function ListHeader({
  tab,
  onTabPress,
}: ListHeaderProps) {
  const { theme } = useTheme();

  return (
    <>
      {isWeb ? (
        <View
          style={[
            Atoms.px_lg,
            Atoms.py_md,
            {
              borderBottomWidth: 1,
              borderBottomColor: theme.palette.neutral_25,
              backgroundColor: theme.palette.neutral_0,
            },
          ]}
        >
          <SearchBar />
        </View>
      ) : (
        <Screen.Topbar
          center={<SearchBar />}
          right={<TopbarSettingsButton />}
        />
      )}

      <FeedTabs tabs={SORT_TABS} active={tab} onPress={onTabPress} />
    </>
  );
});

export default function ExploreScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  const enabled = useEagerLoad();
  const listRef = useRef<ListRef>(null);
  const { tab, hydrated } = useFeedTab('explore');
  // Explore only offers the sort tabs.
  const sort = tab as FeedSortOption;
  const feed = useExploreFeed({ sort, enabled: enabled && hydrated });
  const { refresh } = feed;
  const onTabPress = useFeedTabPress('explore', listRef, refresh);

  // Re-tapping the active navigation tab scrolls to the top and refreshes.
  useFocusedRefresh(
    useCallback(() => {
      listRef.current?.scrollToTop();
      refresh();
    }, [refresh]),
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <FeedList
          ref={listRef}
          feed={feed}
          HeaderComponent={<ListHeader tab={tab} onTabPress={onTabPress} />}
          initialHeaderHeight={isWeb ? 0 : TOPBAR_HEIGHT + TABS_HEIGHT}
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
