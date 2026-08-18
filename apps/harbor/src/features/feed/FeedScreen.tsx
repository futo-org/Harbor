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
import { ComposerInput } from '@/src/features/composer';
import { memo, useCallback, useRef } from 'react';
import { View } from 'react-native';
import type { ListRef } from '@/src/common/components/List';
import { TABS_HEIGHT } from '@/src/common/components/Tabs';
import FeedList from './FeedList';
import { FeedSortTabs } from './FeedSortTabs';
import type { FeedSortOption } from './hooks/feedCache';
import { useFeedSort, useFeedSortPress } from './hooks/useFeedSort';
import { useFollowingFeed } from './hooks/useFollowingFeed';

type ListHeaderProps = {
  sort: FeedSortOption;
  onSortPress: (sort: FeedSortOption) => void;
};

const ListHeader = memo(function ListHeader({
  sort,
  onSortPress,
}: ListHeaderProps) {
  return (
    <>
      {!isWeb ? <Screen.Topbar right={<TopbarSettingsButton />} /> : null}

      <FeedSortTabs sort={sort} onSortPress={onSortPress} />

      {isWeb && <ComposerInput />}
    </>
  );
});

export default function FeedScreen() {
  // iOS uses the detached native compose tab item (see app/(tabs)/_layout.tsx);
  const showComposeFab = !isWeb && !isIOS;

  const enabled = useEagerLoad();
  const listRef = useRef<ListRef>(null);
  const { sort, hydrated } = useFeedSort('following');
  const feed = useFollowingFeed({ sort, enabled: enabled && hydrated });
  const { refresh } = feed;
  const onSortPress = useFeedSortPress('following', listRef, refresh);

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
          HeaderComponent={<ListHeader sort={sort} onSortPress={onSortPress} />}
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
