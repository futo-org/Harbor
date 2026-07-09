import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { Tabs } from '@/src/common/components/Tabs';
import { Routes } from '@/src/common/constants';
import {
  shortenIdentityId,
  truncateName,
  useCurrentIdentity,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FollowButton from './FollowButton';
import {
  type FollowEntry,
  type FollowListMode,
  useFollowList,
} from './hooks/useFollowList';

export default function FollowListScreen({ mode }: { mode: FollowListMode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { identityId } = useLocalSearchParams<{ identityId: string }>();
  const list = useFollowList(mode, identityId);

  // Whose follow lists these are.
  const fallbackUsername = useUsername(identityId ?? null);
  const profile = useProfile(identityId ?? null);
  const username = truncateName(profile.name ?? fallbackUsername, 24);

  // The tabs are routes; switching swaps the sibling page.
  const setMode = (next: FollowListMode) => {
    if (next === mode || !identityId) return;
    router.replace(
      next === 'following'
        ? Routes.tabs.profileFollowing(identityId)
        : Routes.tabs.profileFollowers(identityId),
    );
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <List<FollowEntry>
          HeaderComponent={() => (
            <Topbar
              center={
                <View style={Atoms.align_center}>
                  <Text variant="title" numberOfLines={1}>
                    {username}
                  </Text>
                  <Text variant="small" color="neutral_500" numberOfLines={1}>
                    {identityId ? shortenIdentityId(identityId) : ''}
                    {profile.alias ? ` · ${profile.alias}` : ''}
                  </Text>
                </View>
              }
            />
          )}
          ListHeaderComponent={
            <Tabs>
              <Tabs.Tab
                active={mode === 'following'}
                onPress={() => setMode('following')}
              >
                Following
              </Tabs.Tab>
              <Tabs.Tab
                active={mode === 'followers'}
                onPress={() => setMode('followers')}
              >
                Followers
              </Tabs.Tab>
            </Tabs>
          }
          data={list.entries}
          keyExtractor={(entry) => entry.identity}
          renderItem={({ item }) => <IdentityRow identity={item.identity} />}
          ListEmptyComponent={
            list.isLoading ? null : (
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
                refreshing={list.isLoading}
                onRefresh={list.refresh}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}

// Avatar + name row linking to the identity's profile.
function IdentityRow({ identity }: { identity: string }) {
  const { theme } = useTheme();
  const profile = useProfile(identity);
  const { identityKey } = useCurrentIdentity();
  const name = profile.name ? truncateName(profile.name, 32) : null;
  const isSelf = identityKey === identity;

  return (
    <Pressable
      onPress={() => router.push(Routes.tabs.profile(identity))}
      style={({ hovered, pressed }) => [
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_md,
          Atoms.px_lg,
          Atoms.py_md,
          { borderBottomWidth: 1, borderColor: theme.palette.neutral_25 },
        ]}
      >
        <ProfileAvatar identityKey={identity} size="md" />
        <View style={Atoms.flex_1}>
          <Text
            variant="secondary"
            fontWeight="semibold"
            numberOfLines={1}
            selectable={false}
          >
            {name ?? 'Anonymous'}
          </Text>
          <Text
            variant="small"
            color="neutral_500"
            numberOfLines={1}
            selectable={false}
            style={{ fontFamily: 'monospace' }}
          >
            {shortenIdentityId(identity)}
          </Text>
        </View>
        {!isSelf && <FollowButton identity={identity} />}
      </View>
    </Pressable>
  );
}
