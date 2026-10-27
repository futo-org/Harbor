import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Routes } from '@/src/common/constants';
import { Atoms } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

export function ReporterChip({ identity }: { identity: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.navigate(Routes.tabs.profile(identity))}
      style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_2xs]}
    >
      <ProfileAvatar identityKey={identity} size="xs" />
      <Username
        identity={identity}
        variant="small"
        color="neutral_700"
        fontWeight="semibold"
        selectable={false}
      />
    </Pressable>
  );
}
