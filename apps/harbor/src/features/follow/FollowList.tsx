import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Routes } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FollowButton from './FollowButton';
import {
  type FollowEntry,
  type FollowListMode,
  useFollowList,
} from './hooks/useFollowList';

/** One page of the follow lists. The topbar and tabs above it belong to the
 *  screen, since both pages share them. */
export default function FollowList({
  mode,
  active = true,
}: {
  mode: FollowListMode;
  /** True for the page being shown; only that page loads. */
  active?: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { identityId } = useLocalSearchParams<{ identityId: string }>();
  const list = useFollowList(mode, identityId, active);

  return (
    <List<FollowEntry>
      data={list.entries}
      keyExtractor={(entry) => entry.identity}
      renderItem={({ item }) => <IdentityRow identity={item.identity} />}
      ListEmptyComponent={
        // A page nobody has opened has nothing to show and is not fetching, so
        // it holds its peace rather than claiming the list is empty.
        list.isLoading || !active ? null : (
          <ListEmpty>
            {mode === 'following'
              ? 'Not following anyone yet.'
              : 'No followers yet.'}
          </ListEmpty>
        )
      }
      ListFooterComponent={
        list.hasMore && list.entries.length > 0 ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.palette.neutral_500}
              accessibilityLabel="Loading more"
            />
          </View>
        ) : null
      }
      onEndReached={list.hasMore ? list.loadMore : undefined}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={list.isRefreshing}
            onRefresh={list.refresh}
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

// Avatar + name row linking to the identity's profile.
function IdentityRow({ identity }: { identity: string }) {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const isSelf = identityKey === identity;

  return (
    <ProfileRow
      identity={identity}
      onPress={() => router.push(Routes.tabs.profile(identity))}
      style={{ borderBottomWidth: 1, borderColor: theme.palette.neutral_25 }}
      trailing={!isSelf ? <FollowButton identity={identity} /> : undefined}
    />
  );
}
