import {
  Text,
  Avatar,
  type AvatarSizePreset,
  IdentityTag,
  type TextVariant,
} from '@/src/common/components/primitives';
import { useUsername, identiconUrl } from '@/src/common/lib/polycentric-hooks';
import { Atoms, type SpacingToken } from '@/src/common/theme';
import { View } from 'react-native';

type BadgeSize = 'md' | 'lg';

interface IdentityBadgeProps {
  identityKey: string;
  size?: BadgeSize;
  showAvatar?: boolean;
  showId?: boolean;
}

export function IdentityBadge({
  identityKey,
  size = 'md',
  showAvatar = true,
  showId = true,
}: IdentityBadgeProps) {
  const username = useUsername(identityKey);
  const avatarUrl = identiconUrl(identityKey);

  const sizeConfig = CONFIG[size];
  const rowGap = size === 'lg' ? Atoms.gap_md : Atoms.gap_sm;

  return (
    <View style={[Atoms.flex_row, Atoms.items_center, rowGap, { flex: 1 }]}>
      {showAvatar && (
        <Avatar
          source={avatarUrl ? { uri: avatarUrl } : undefined}
          size={sizeConfig.avatarSize}
        />
      )}
      <View
        style={[
          Atoms.flex_row,
          Atoms.gap_sm,
          { flex: 1, alignItems: 'baseline' },
        ]}
      >
        <Text
          variant={sizeConfig.textVariant}
          fontWeight="semibold"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {username}
        </Text>
        {showId && <IdentityTag identity={identityKey} />}
      </View>
    </View>
  );
}

const CONFIG: Record<
  BadgeSize,
  {
    avatarSize: AvatarSizePreset;
    textVariant: TextVariant;
    gap: SpacingToken;
  }
> = {
  md: {
    avatarSize: 'md',
    textVariant: 'body',
    gap: 'sm',
  },
  lg: {
    avatarSize: 'md',
    textVariant: 'subtitle',
    gap: 'md',
  },
};
