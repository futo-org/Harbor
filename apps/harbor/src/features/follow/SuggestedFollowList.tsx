import { List } from '@/src/common/components/List';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FollowButton from './FollowButton';
import {
  type FollowSuggestionEntry,
  useSuggestedFollows,
} from './hooks/useSuggestedFollows';

/** Identities the viewer could follow, best connected first. */
export function SuggestedFollowList({
  active = true,
}: {
  /** True for the page being shown; only that page loads. */
  active?: boolean;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const suggestions = useSuggestedFollows({ enabled: active });

  return (
    <List<FollowSuggestionEntry>
      data={suggestions.entries}
      keyExtractor={(entry) => entry.identity}
      renderItem={({ item }) => <SuggestionRow identity={item.identity} />}
      ListEmptyComponent={
        suggestions.isLoading ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.colors.muted}
              accessibilityLabel="Loading suggestions"
            />
          </View>
        ) : // A page nobody has opened has nothing to show and is not
        // fetching, so it holds its peace.
        active ? (
          <ListEmpty>No people to suggest yet</ListEmpty>
        ) : null
      }
      ListFooterComponent={
        suggestions.hasMore && suggestions.entries.length > 0 ? (
          <View style={[Atoms.items_center, Atoms.p_lg]}>
            <ActivityIndicator
              size="small"
              color={theme.colors.muted}
              accessibilityLabel="Loading more"
            />
          </View>
        ) : null
      }
      onEndReached={suggestions.hasMore ? suggestions.loadMore : undefined}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={suggestions.isRefreshing}
            onRefresh={suggestions.refresh}
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

// Avatar + name row linking to the identity's profile.
function SuggestionRow({ identity }: { identity: string }) {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const isSelf = identityKey === identity;

  return (
    <ProfileRow
      identity={identity}
      linkToProfile
      style={[theme.atoms.box.primary.border, Atoms.border_b]}
      trailing={!isSelf ? <FollowButton identity={identity} /> : undefined}
    />
  );
}
