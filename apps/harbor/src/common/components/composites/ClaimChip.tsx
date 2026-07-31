import { Chip } from '@/src/common/components/primitives';
import { useTheme } from '@/src/common/theme';

type ClaimType = 'all' | 'verified' | 'unverified' | 'pending';

interface ClaimChipProps {
  type: ClaimType;
  isSelected?: boolean;
  onPress?: () => void;
}

const TITLE_MAP: Record<ClaimType, string> = {
  all: 'All',
  verified: 'Verified',
  unverified: 'Unverified',
  pending: 'Pending',
};

export function ClaimChip({
  type,
  isSelected = false,
  onPress,
}: ClaimChipProps) {
  const { theme } = useTheme();

  const selectedTextToken =
    theme.scheme === 'dark' ? 'primary_500' : 'primary_600';

  return (
    <Chip
      title={TITLE_MAP[type]}
      size="md"
      onPress={onPress}
      backgroundColor={
        isSelected ? theme.palette.primary_100 : theme.palette.neutral_100
      }
      borderColor={
        isSelected ? theme.palette.primary_300 : theme.palette.neutral_200
      }
      textColor={isSelected ? selectedTextToken : 'neutral_800'}
    />
  );
}
