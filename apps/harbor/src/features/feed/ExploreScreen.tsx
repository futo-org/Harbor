import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { PagerView } from '@/src/common/components/PagerView';
import { TabFilterSheet } from '@/src/common/components/tabs';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, useTheme } from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SearchBar } from '../search/SearchBar';
import { FeedPage } from './FeedPage';
import {
  EXPLORE_TABS,
  EXPLORE_TAB_VALUES,
  FeedTabs,
  SORT_OPTIONS,
} from './FeedTabs';
import type { FeedSortOption } from './hooks/feedCache';
import { useExploreFeed } from './hooks/useExploreFeed';
import { useFeedSettingsStore } from './hooks/useFeedSettingsStore';
import { useFeedTabs } from './hooks/useFeedTabs';

function ExplorePage({
  sort,
  active,
  ready,
}: {
  sort: FeedSortOption;
  /** True for the page being shown; only that page loads. */
  active: boolean;
  /** False until the screen may fetch at all. */
  ready: boolean;
}) {
  const feed = useExploreFeed({ sort, enabled: ready && active });
  return <FeedPage feed={feed} active={active} />;
}

export default function ExploreScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;
  const { theme } = useTheme();

  usePageTitle('Explore');

  const ready = useEagerLoad();
  const { tab, hydrated, onTabPress } = useFeedTabs('explore');
  const sort = useFeedSettingsStore((state) => state.feeds.explore.sort);

  const onSortChange = (next: FeedSortOption) => {
    useFeedSettingsStore.getState().setFeedSettings('explore', {
      sort: next,
    });
    emitFocusedRefresh();
  };

  const renderTabBar = ({
    dragProgress,
  }: {
    dragProgress: SharedValue<number>;
  }) => (
    <>
      {isWeb ? (
        // Web has no topbar here, so explore carries its own search entry
        // rather than the right sidebar's.
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
      <FeedTabs
        tabs={EXPLORE_TABS}
        active={tab}
        onPress={onTabPress}
        progress={dragProgress}
        menu={({ open, onClose }) => (
          <TabFilterSheet
            open={open}
            onClose={onClose}
            title="Sort by"
            options={SORT_OPTIONS}
            selected={sort}
            onChange={(next) => {
              onSortChange(next);
              onClose();
            }}
          />
        )}
      />
    </>
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        {/* Held back so the pager does not open on the default tab first. */}
        {hydrated ? (
          <PagerView
            values={EXPLORE_TAB_VALUES}
            active={tab}
            onChange={onTabPress}
            renderTabBar={renderTabBar}
          >
            <ExplorePage sort={sort} active={tab === 'posts'} ready={ready} />
            <ListEmpty>No people to suggest yet</ListEmpty>
          </PagerView>
        ) : null}

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
