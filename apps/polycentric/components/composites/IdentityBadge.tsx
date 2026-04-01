import {
  Text,
  Avatar,
  type AvatarSizePreset,
  PubkeyTag,
  type TextVariant,
} from '@/components/primitives';
import { Box } from '@/components/layouts';
import { useUsername, identiconUrl } from '@/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { SpacingToken } from '@/legacyTheme/tokens';

type BadgeSize = 'md' | 'lg';

interface IdentityBadgeProps {
  publicKey: types.PublicKey;
  size?: BadgeSize;
  showAvatar?: boolean;
  showId?: boolean;
}

export function IdentityBadge({
  publicKey,
  size = 'md',
  showAvatar = true,
  showId = true,
}: IdentityBadgeProps) {
  const username = useUsername(publicKey);
  const avatarUrl = identiconUrl(publicKey);

  const sizeConfig = CONFIG[size];

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap={sizeConfig.gap}
      style={{ flex: 1 }}
    >
      {showAvatar && (
        <Avatar
          source={avatarUrl ? { uri: avatarUrl } : undefined}
          size={sizeConfig.avatarSize}
        />
      )}
      <Box
        flexDirection="row"
        alignItems="baseline"
        gap="sm"
        style={{ flex: 1 }}
      >
        <Text
          variant={sizeConfig.textVariant}
          fontWeight="semibold"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {username}
        </Text>
        {showId && <PubkeyTag publicKey={publicKey} />}
      </Box>
    </Box>
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
