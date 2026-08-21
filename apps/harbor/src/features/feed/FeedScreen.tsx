import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { PagerView } from '@/src/common/components/PagerView';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { TabFilterSheet } from '@/src/common/components/tabs';
import { ComposerInput } from '@/src/features/composer';
import type { SharedValue } from 'react-native-reanimated';
import { FeedPage } from './FeedPage';
import { FeedTabs, HOME_TABS, HOME_TAB_VALUES, SORT_OPTIONS } from './FeedTabs';
import type { FeedSortOption } from './hooks/feedCache';
import { useFeedSettingsStore } from './hooks/useFeedSettingsStore';
import { useFeedTabs } from './hooks/useFeedTabs';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { useRecommendedFeed } from './hooks/useRecommendedFeed';

type PageProps = {
  /** True for the page being shown; only that page loads. */
  active: boolean;
  /** False until the screen may fetch at all. */
  ready: boolean;
};

// Web tops each page with the composer, so it scrolls under the pinned tabs.
const PageHeader = isWeb ? ComposerInput : undefined;

function ForYouPage({ active, ready }: PageProps) {
  const feed = useRecommendedFeed({ enabled: ready && active });
  return (
    <FeedPage feed={feed} active={active} ListHeaderComponent={PageHeader} />
  );
}

function FollowingPage({
  sort,
  active,
  ready,
}: PageProps & { sort: FeedSortOption }) {
  const feed = useFollowingFeed({ sort, enabled: ready && active });
  return (
    <FeedPage feed={feed} active={active} ListHeaderComponent={PageHeader} />
  );
}

export default function FeedScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  usePageTitle('Home');

  const ready = useEagerLoad();
  const { tab, hydrated, onTabPress } = useFeedTabs('following');
  const sort = useFeedSettingsStore((state) => state.feeds.following.sort);

  const onSortChange = (next: FeedSortOption) => {
    useFeedSettingsStore.getState().setFeedSettings('following', {
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
      {!isWeb ? <Screen.Topbar right={<TopbarSettingsButton />} /> : null}
      <FeedTabs
        tabs={HOME_TABS}
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
            values={HOME_TAB_VALUES}
            active={tab}
            onChange={onTabPress}
            renderTabBar={renderTabBar}
          >
            <ForYouPage active={tab === 'for-you'} ready={ready} />
            <FollowingPage
              sort={sort}
              active={tab === 'following'}
              ready={ready}
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
