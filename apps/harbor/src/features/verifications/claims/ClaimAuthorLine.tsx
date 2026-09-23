import { Text } from '@/src/common/components';
import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import {
  type AvatarSizePreset,
  IdentityTag,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo } from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
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
        <Username
          identity={identity}
          variant="secondary"
          fontWeight="bold"
          style={hovered && Atoms.text_underline}
        />
        <IdentityTag identity={identity} />
      </Pressable>
      <Text variant="secondary" color="neutral_500" fontWeight="bold">
        ·
      </Text>
      <Text variant="secondary" color="neutral_500" style={Atoms.flex_shrink_0}>
        {timeAgo(Number(createdAt))}
      </Text>
    </View>
  );
}
