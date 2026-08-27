import { View, ActivityIndicator } from 'react-native';
import { Atoms, useTheme } from '@/src/common/theme';
import { Text, LinkButton } from '@/src/common/components';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { router, usePathname } from 'expo-router';
import { Routes } from '@/src/common/constants';
import FollowButton from '@/src/features/follow/FollowButton';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { useSuggestedFollows } from '@/src/features/follow/hooks/useSuggestedFollows';
import { FetchMode } from '@polycentric/react-native';

const SUGGESTIONS_LIMIT = 5;

export function SuggestedFollowWidget() {
  const { theme } = useTheme();
  const pathname = usePathname();
  // Avoid duplication of the same content.
  // This check is only valid on the web, but the component is web-only
  const active = pathname !== Routes.tabs.explore.people;

  const { isLoading, entries, hasMore } = useSuggestedFollows({
    enabled: active,
    limit: SUGGESTIONS_LIMIT,
    fetchMode: FetchMode.OfflineFirst,
  });

  const showMore = () => {
    // This wouldn't work on the native side as explore.people is not mounted as
    // a native route, but it works on web and this widget is web-only
    router.push(Routes.tabs.explore.people);
  };

  if (!active) return null;

  return (
    <View
      style={[
        Atoms.rounded_xl,
        Atoms.p_lg,
        Atoms.w_full,
        Atoms.gap_md,
        Atoms.flex_shrink_1,
        Atoms.overflow_hidden,
        { borderWidth: 1, borderColor: theme.palette.neutral_25 },
      ]}
    >
      <Text fontSize="lg" fontWeight="bold">
        Who to follow
      </Text>

      {entries.length === 0 && isLoading ? (
        <View style={Atoms.p_lg}>
          <ActivityIndicator
            size="small"
            color={theme.palette.neutral_500}
            accessibilityLabel="Loading suggestions"
          />
        </View>
      ) : entries.length > 0 ? (
        <>
          <View>
            {entries.map((item) => (
              <SuggestedFollowWidgetRow
                key={item.identity}
                identity={item.identity}
              />
            ))}
          </View>
          {hasMore && (
            <LinkButton
              title="See more"
              onPress={showMore}
              fontWeight="regular"
              underlineOnHover
              containerStyle={Atoms.self_start}
            />
          )}
        </>
      ) : (
        <ListEmpty>No people to suggest yet</ListEmpty>
      )}
    </View>
  );
}

function SuggestedFollowWidgetRow({ identity }: { identity: string }) {
  const { identityKey } = useCurrentIdentity();
  const isSelf = identityKey === identity;

  return (
    <ProfileRow
      size="sm"
      identity={identity}
      onPress={() => router.push(Routes.tabs.profile(identity))}
      style={Atoms.px_0}
      activeStyle="none"
      trailing={!isSelf ? <FollowButton identity={identity} /> : undefined}
    />
  );
}
