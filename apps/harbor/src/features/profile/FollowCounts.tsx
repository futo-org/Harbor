import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { Atoms } from '@/src/common/theme';
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

type FollowCountsProps = {
  identityKey: string;
  following: number;
  followers: number;
};

/** Following / followers counts linking to their lists. */
export function FollowCounts({
  identityKey,
  following,
  followers,
}: FollowCountsProps) {
  const counts: {
    label: string;
    count: number;
    route: Href;
  }[] = [
    {
      label: 'Following',
      count: following,
      route: Routes.tabs.profileFollowing(identityKey),
    },
    {
      label: 'Followers',
      count: followers,
      route: Routes.tabs.profileFollowers(identityKey),
    },
  ];

  return (
    <View style={[Atoms.flex_row, Atoms.gap_md, Atoms.mt_sm]}>
      {counts.map(({ label, count, route }) => (
        <Pressable
          key={label}
          accessibilityRole="link"
          onPress={() => router.navigate(route)}
          style={({ pressed }) => [pressed && Atoms.faded]}
        >
          <Text variant="secondary" color="muted" selectable={false}>
            <Text variant="secondary" fontWeight="semibold">
              {count}
            </Text>{' '}
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
