import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { PagerView } from '@/src/common/components/PagerView';
import { TabFilterSheet } from '@/src/common/components/tabs';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { useHead } from '@/src/common/lib/head/useHead';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SuggestedFollowList } from '../follow/SuggestedFollowList';
import { SearchBar } from '../search/SearchBar';
import { FeedPage } from './FeedPage';
import {
  EXPLORE_TABS,
  EXPLORE_TAB_VALUES,
  FeedTabs,
  SORT_OPTIONS,
  type ExploreTab,
} from './FeedTabs';
import type { FeedSortOption } from './hooks/feedCache';
import { useExploreFeed } from './hooks/useExploreFeed';
import {
  useFeedSettingsHydrated,
  useFeedSettingsStore,
} from './hooks/useFeedSettingsStore';
import { useExploreTab } from './hooks/useExploreTab';
import {
  exploreHead,
  explorePeopleHead,
  homeHead,
} from '@/src/features/feed/head';

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

type ExploreScreenProps = {
  tab?: ExploreTab;
  /** Shown as the home page, at `/` */
  isHome?: boolean;
};

export default function ExploreScreen({
  tab: routeTab = 'posts',
  isHome = false,
}: ExploreScreenProps) {
  const showComposeFab = !isWeb;
  const { theme } = useTheme();

  useHead(
    isHome ? homeHead : routeTab === 'people' ? explorePeopleHead : exploreHead,
  );

  const ready = useEagerLoad();
  const { tab, onTabPress } = useExploreTab(routeTab);
  const hydrated = useFeedSettingsHydrated();
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
            theme.atoms.box.primary.bg,
            theme.atoms.box.primary.border,
            Atoms.border_b,
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
        {/* Held back so posts don't fetch with the default sort first. */}
        {hydrated ? (
          <PagerView
            values={EXPLORE_TAB_VALUES}
            active={tab}
            onChange={onTabPress}
            renderTabBar={renderTabBar}
          >
            <ExplorePage sort={sort} active={tab === 'posts'} ready={ready} />
            <SuggestedFollowList active={ready && tab === 'people'} />
          </PagerView>
        ) : null}

        {showComposeFab ? (
          <Fab
            onPress={openCompose}
            accessibilityLabel="New post"
            icon={({ color }) => <Icon name="add" size={32} color={color} />}
          />
        ) : null}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
