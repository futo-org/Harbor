import { Chip } from '@/src/common/components/primitives';
import { FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '@/src/common/theme';

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

  const selectedTextToken =
    theme.scheme === 'dark' ? 'primary_500' : 'primary_600';

  const iconColor = isSelected
    ? theme.palette[selectedTextToken]
    : theme.palette.neutral_800;

  return (
    <Chip
      title={title}
      size="md"
      leftIcon={() => <FontAwesome6 name={icon} size={14} color={iconColor} />}
      onPress={onPress}
      backgroundColor={
        isSelected ? theme.palette.primary_100 : theme.palette.neutral_100
      }
      fontWeight={'regular'}
      borderColor={
        isSelected ? theme.palette.primary_300 : theme.palette.neutral_200
      }
      textColor={isSelected ? selectedTextToken : 'neutral_800'}
    />
  );
}
