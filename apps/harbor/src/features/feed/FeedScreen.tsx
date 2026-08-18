import { Fab } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { TopbarSettingsButton } from '@/src/common/components/layout/topbar/SettingsButton';
import { openCompose } from '@/src/common/constants';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { isIOS, isWeb } from '@/src/common/util/platform';
import { ComposerInput } from '@/src/features/composer';
import { memo, useCallback, useRef } from 'react';
import type { ListRef } from '@/src/common/components/List';
import { TABS_HEIGHT } from '@/src/common/components/Tabs';
import FeedList from './FeedList';
import { FeedTabs, HOME_TABS } from './FeedTabs';
import type { FeedTab } from './hooks/feedCache';
import { useFeedTab, useFeedTabPress } from './hooks/useFeedTabs';
import { useFollowingFeed } from './hooks/useFollowingFeed';
import { useRecommendedFeed } from './hooks/useRecommendedFeed';

type ListHeaderProps = {
  tab: FeedTab;
  onTabPress: (tab: FeedTab) => void;
};

const ListHeader = memo(function ListHeader({
  tab,
  onTabPress,
}: ListHeaderProps) {
  return (
    <>
      {!isWeb ? <Screen.Topbar right={<TopbarSettingsButton />} /> : null}

      <FeedTabs tabs={HOME_TABS} active={tab} onPress={onTabPress} />

      {isWeb && <ComposerInput />}
    </>
  );
});

export default function FeedScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  const enabled = useEagerLoad();
  const listRef = useRef<ListRef>(null);
  const { tab, hydrated } = useFeedTab('following');
  const ready = enabled && hydrated;
  const forYou = tab === 'for-you';

  // Both feeds are declared; `enabled` decides which one actually queries.
  const recommended = useRecommendedFeed({ enabled: ready && forYou });
  const following = useFollowingFeed({
    sort: forYou ? 'latest' : tab,
    enabled: ready && !forYou,
  });
  const feed = forYou ? recommended : following;

  const { refresh } = feed;
  const onTabPress = useFeedTabPress('following', listRef, refresh);

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
