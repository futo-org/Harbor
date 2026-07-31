import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { Routes } from '@/src/common/constants';
import { truncateName } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Chip } from './Chip';

export function IdentityChip({ identity }: { identity: string }) {
  const profile = useProfile(identity);
  const name = profile.name ? truncateName(profile.name, 24) : undefined;

  return (
    <Pressable onPress={() => router.push(Routes.tabs.profile(identity))}>
      <Chip style={Atoms.pl_xs}>
        {/* 20 matches ChipIcon's bubble so sibling chips share a height. */}
        <ProfileAvatar identityKey={identity} size={20} />
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_xs]}>
          {name && (
            <Text
              variant="small"
              color="neutral_700"
              fontWeight="semibold"
              selectable={false}
            >
              {name}
            </Text>
          )}
          <Text
            variant="small"
            color="neutral_500"
            selectable={false}
            style={{ fontFamily: 'monospace' }}
          >
            {identity.slice(0, 8)}
          </Text>
        </View>
      </Chip>
    </Pressable>
  );
}
