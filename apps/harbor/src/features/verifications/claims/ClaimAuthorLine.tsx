import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import {
  type AvatarSizePreset,
  IdentityTag,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo, truncateName } from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

/** The post-style author line: inline avatar, name, id, and time. */
export function ClaimAuthorLine({
  identity,
  createdAt,
  avatarSize = 'sm',
}: {
  identity: string;
  createdAt: bigint;
  avatarSize?: AvatarSizePreset;
}) {
  const profile = useProfile(identity);
  const name = profile.name ? truncateName(profile.name, 24) : '...';
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  return (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_sm]}>
      <Pressable
        onPress={() => router.push(Routes.tabs.profile(identity))}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          avatarSize === 'sm' ? Atoms.gap_sm : Atoms.gap_md,
          Atoms.flex_shrink_1,
        ]}
      >
        <ProfileAvatar identityKey={identity} size={avatarSize} />
        <Text
          variant="secondary"
          fontWeight="bold"
          numberOfLines={1}
          style={[Atoms.flex_shrink_1, hovered && Atoms.text_underline]}
        >
          {name}
        </Text>
        <IdentityTag identity={identity} />
      </Pressable>
      <Text variant="secondary" color="neutral_500" fontWeight="bold">
        ·
      </Text>
      <Text variant="secondary" color="neutral_500">
        {timeAgo(Number(createdAt))}
      </Text>
    </View>
  );
}
