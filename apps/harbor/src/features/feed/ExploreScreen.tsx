import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { PagerView } from '@/src/common/components/PagerView';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { Atoms, useTheme } from '@/src/common/theme';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SearchBar } from '../search/SearchBar';
import { FeedPage } from './FeedPage';
import { FeedTabs, SORT_TABS, SORT_TAB_VALUES } from './FeedTabs';
import type { FeedSortOption } from './hooks/feedCache';
import { useExploreFeed } from './hooks/useExploreFeed';
import { type FeedPageControlRef, useFeedTabs } from './hooks/useFeedTabs';

function ExplorePage({
  sort,
  active,
  ready,
  controlRef,
}: {
  sort: FeedSortOption;
  /** True for the page being shown; only that page loads. */
  active: boolean;
  /** False until the screen may fetch at all. */
  ready: boolean;
  controlRef: FeedPageControlRef;
}) {
  const feed = useExploreFeed({ sort, enabled: ready && active });
  return <FeedPage feed={feed} active={active} controlRef={controlRef} />;
}

export default function ExploreScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;
  const { theme } = useTheme();

  const ready = useEagerLoad();
  const { tab, hydrated, control, onTabPress, refreshActive } =
    useFeedTabs('explore');

  // Re-tapping the navigation tab scrolls to the top and refreshes.
  useFocusedRefresh(refreshActive);

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
        tabs={SORT_TABS}
        active={tab}
        onPress={onTabPress}
        progress={dragProgress}
      />
    </>
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        {/* Held back so the pager does not open on the default tab first. */}
        {hydrated ? (
          <PagerView
            values={SORT_TAB_VALUES}
            active={tab}
            onChange={onTabPress}
            renderTabBar={renderTabBar}
          >
            <ExplorePage
              sort="top"
              active={tab === 'top'}
              ready={ready}
              controlRef={control}
            />
            <ExplorePage
              sort="latest"
              active={tab === 'latest'}
              ready={ready}
              controlRef={control}
            />
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
