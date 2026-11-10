import { Screen } from '@/src/common/components/layout';
import { PagerView } from '@/src/common/components/PagerView';
import { Tabs } from '@/src/common/components/tabs';
import { Routes } from '@/src/common/constants';
import { replacePath } from '@/src/common/lib/navigation/replacePath';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import FollowList from './FollowList';
import { FollowListTopbar } from './FollowListTopbar';
import type { FollowListMode } from './hooks/useFollowList';

/** Page order behind the tab bar. */
const FOLLOW_TABS: readonly FollowListMode[] = ['following', 'followers'];
const FOLLOW_TAB_LABELS: Record<FollowListMode, string> = {
  following: 'Following',
  followers: 'Followers',
};

/** Following and Followers as swipeable pages. Both `/[id]/following` and
 *  `/[id]/followers` land here; `mode` picks which one opens. */
export default function FollowListScreen({ mode }: { mode: FollowListMode }) {
  const { identityId } = useLocalSearchParams<{ identityId: string }>();
  const [tab, setTab] = useState<FollowListMode>(mode);
  usePageTitle(tab === 'following' ? 'Following' : 'Followers');

  const selectTab = (next: FollowListMode) => {
    setTab(next);
    if (!identityId) return;
    replacePath(
      next === 'following'
        ? Routes.tabs.profileFollowing(identityId)
        : Routes.tabs.profileFollowers(identityId),
    );
  };

  const renderTabBar = ({
    dragProgress,
  }: {
    dragProgress: SharedValue<number>;
  }) => (
    <>
      <FollowListTopbar identityId={identityId} />
      <Tabs progress={dragProgress}>
        {FOLLOW_TABS.map((value) => (
          <Tabs.Tab
            key={value}
            active={tab === value}
            onPress={() => selectTab(value)}
          >
            {FOLLOW_TAB_LABELS[value]}
          </Tabs.Tab>
        ))}
      </Tabs>
    </>
  );

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <PagerView
          values={FOLLOW_TABS}
          active={tab}
          onChange={selectTab}
          renderTabBar={renderTabBar}
        >
          <FollowList mode="following" active={tab === 'following'} />
          <FollowList mode="followers" active={tab === 'followers'} />
        </PagerView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
