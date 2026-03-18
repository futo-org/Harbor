import { Chip } from '@/components/primitives';

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
  return (
    <Chip
      title={TITLE_MAP[type]}
      size="md"
      onPress={onPress}
      backgroundColor={
        isSelected ? 'primaryOpacity20' : 'neutralSurfaceOpacity20'
      }
      borderColor={isSelected ? 'primaryOpacity40' : 'neutralSurfaceOpacity20'}
      textColor={isSelected ? 'primary' : 'text'}
    />
  );
}
