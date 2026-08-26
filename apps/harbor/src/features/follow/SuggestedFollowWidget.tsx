import { View, ActivityIndicator } from 'react-native';
import { Atoms, useTheme } from '@/src/common/theme';
import { Text, LinkButton } from '@/src/common/components';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { router, usePathname, useRouter } from 'expo-router';
import { Routes } from '@/src/common/constants';
import FollowButton from '@/src/features/follow/FollowButton';
import { ListEmpty } from '@/src/common/components/ListEmpty';
import { useEagerLoad } from '@/src/common/lib/navigation/useEagerLoad';
import { useSuggestedFollows } from '@/src/features/follow/hooks/useSuggestedFollows';

const SUGGESTIONS_LIMIT = 4;

export function SuggestedFollowWidget() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const { isLoading, entries, hasMore } = useSuggestedFollows(
    useEagerLoad(),
    SUGGESTIONS_LIMIT,
  );

  const showMore = () => {
    // This works because entire component is web-only
    router.push(Routes.tabs.explore.people);
  };

  // Avoid duplication of the same content.
  // This check is only valid on the web, but the component is web-only
  if (pathname === Routes.tabs.explore.people) return null;

  return (
    <View
      style={[
        Atoms.rounded_xl,
        Atoms.p_lg,
        Atoms.w_full,
        Atoms.gap_md,
        { borderWidth: 1, borderColor: theme.palette.neutral_25 },
        { flexShrink: 1, overflow: 'hidden' },
      ]}
    >
      <Text fontSize="lg" fontWeight="bold">
        Who to follow
      </Text>

      {isLoading ? (
        <View style={[Atoms.items_center, Atoms.p_lg]}>
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
