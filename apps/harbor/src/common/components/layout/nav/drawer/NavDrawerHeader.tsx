import { ProfileAvatar } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { FollowCounts } from '@/src/features/profile/FollowCounts';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { Username } from '@/src/features/profile/Username';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

export function NavDrawerHeader() {
  const { identity } = useCurrentIdentity();
  const identityKey = identity?.identityKey;
  if (!identityKey) return null;

  return (
    <View style={[Atoms.px_lg, Atoms.pt_md]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.navigate(Routes.tabs.profile(identityKey))}
        style={({ pressed }) => [Atoms.gap_sm, pressed && Atoms.faded]}
      >
        <ProfileAvatar identityKey={identityKey} size="lg" />
        <View>
          <Username
            identity={identityKey}
            fallbackName=""
            fontSize="lg"
            fontWeight="bold"
            color="primary"
          />
          <IdentityHandle identity={identityKey} />
        </View>
      </Pressable>
      <Metrics identityKey={identityKey} />
    </View>
  );
}

function Metrics({ identityKey }: { identityKey: string }) {
  const profile = useProfile(identityKey);
  return (
    <FollowCounts
      identityKey={identityKey}
      following={profile.followingCount}
      followers={profile.followersCount}
    />
  );
}
