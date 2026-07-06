import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { Emoji } from './Emoji';
import type { EmojiEntry } from './emojiData';

type EmojiGridRowProps = {
  emojis: EmojiEntry[];
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
};

export function EmojiGridRow({
  emojis,
  onSelect,
  selectedEmoji,
}: EmojiGridRowProps) {
  if (emojis.length === 0) return null;

  return (
    <View
      style={[Atoms.flex_row, Atoms.justify_between, Atoms.px_xs, Atoms.py_xs]}
    >
      {emojis.map((entry) => (
        <Emoji
          key={entry.code.join('-')}
          emoji={entry.emoji}
          onPress={() => onSelect(entry.emoji)}
          selected={selectedEmoji === entry.emoji}
        />
      ))}
    </View>
  );
}
