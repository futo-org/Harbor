import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import { Emoji } from './Emoji';

type EmojiPickerInlineProps = {
  selectedEmoji?: string | null;
  onSelect?: (emoji: string) => void;
};

export default function EmojiPickerInline({
  selectedEmoji,
  onSelect,
}: EmojiPickerInlineProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.flex_row,
        { backgroundColor: theme.palette.neutral_25 },
        Atoms.px_md,
        Atoms.py_sm,
        Atoms.gap_sm,
        Atoms.rounded_full,
      ]}
    >
      {recommendedEmojis.map((emoji) => (
        <Emoji
          key={emoji.name}
          emoji={emoji.emoji}
          onPress={() => onSelect?.(emoji.emoji)}
          style={[Atoms.p_xs]}
          selected={selectedEmoji === emoji.emoji}
        />
      ))}
    </View>
  );
}

const recommendedEmojis = [
  { code: ['1F602'], emoji: '😂', name: 'face with tears of joy' },
  { code: ['1F923'], emoji: '🤣', name: 'rolling on the floor laughing' },
  { code: ['1F60D'], emoji: '😍', name: 'smiling face with heart-eyes' },
  { code: ['1F44D'], emoji: '👍', name: 'thumbs up' },
  { code: ['1F4AA'], emoji: '💪', name: 'flexed biceps' },
];
