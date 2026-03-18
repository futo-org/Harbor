import { Chip } from '@/components/primitives';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '@/theme';

export type FeedType = 'explore' | 'following' | 'topic' | 'posts' | 'likes';

interface FeedChipProps {
  type: FeedType;
  title: string;
  isSelected?: boolean;
  onPress?: () => void;
}

const ICON_MAP: Record<FeedType, string> = {
  explore: 'earth-americas',
  following: 'user',
  topic: 'hashtag',
  posts: 'newspaper',
  likes: 'heart',
};

export function FeedChip({
  type,
  title,
  isSelected = false,
  onPress,
}: FeedChipProps) {
  const icon = ICON_MAP[type];
  const { theme } = useTheme();

  const iconColor = isSelected
    ? theme.colors.primary
    : theme.colors.neutralSurface;

  return (
    <Chip
      title={title}
      size="md"
      leftIcon={() => <FontAwesome6 name={icon} size={14} color={iconColor} />}
      onPress={onPress}
      backgroundColor={
        isSelected ? 'primaryOpacity20' : 'neutralSurfaceOpacity20'
      }
      fontWeight={'regular'}
      borderColor={isSelected ? 'primaryOpacity40' : 'neutralSurfaceOpacity20'}
      textColor={isSelected ? 'primary' : 'text'}
    />
  );
}
