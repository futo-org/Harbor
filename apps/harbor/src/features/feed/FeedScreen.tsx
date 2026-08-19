import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { PagerView } from '@/src/common/components/PagerView';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { ComposerInput } from '@/src/features/composer';
import type { SharedValue } from 'react-native-reanimated';
import { FeedPage } from './FeedPage';
import { FeedTabs, HOME_TABS, HOME_TAB_VALUES } from './FeedTabs';
import type { FeedSortOption } from './hooks/feedCache';
import { type FeedPageControlRef, useFeedTabs } from './hooks/useFeedTabs';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { useRecommendedFeed } from './hooks/useRecommendedFeed';

type PageProps = {
  /** True for the page being shown; only that page loads. */
  active: boolean;
  /** False until the screen may fetch at all. */
  ready: boolean;
  controlRef: FeedPageControlRef;
};

function ForYouPage({ active, ready, controlRef }: PageProps) {
  const feed = useRecommendedFeed({ enabled: ready && active });
  return <FeedPage feed={feed} active={active} controlRef={controlRef} />;
}

function FollowingPage({
  sort,
  active,
  ready,
  controlRef,
}: PageProps & { sort: FeedSortOption }) {
  const feed = useFollowingFeed({ sort, enabled: ready && active });
  return <FeedPage feed={feed} active={active} controlRef={controlRef} />;
}

export default function FeedScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  const ready = useEagerLoad();
  const { tab, hydrated, control, onTabPress, refreshActive } =
    useFeedTabs('following');

  // Re-tapping the navigation tab scrolls to the top and refreshes.
  useFocusedRefresh(refreshActive);

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
      />
      {isWeb && <ComposerInput />}
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
            <ForYouPage
              active={tab === 'for-you'}
              ready={ready}
              controlRef={control}
            />
            <FollowingPage
              sort="top"
              active={tab === 'top'}
              ready={ready}
              controlRef={control}
            />
            <FollowingPage
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
