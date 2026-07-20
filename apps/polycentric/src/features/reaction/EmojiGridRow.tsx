import React from 'react';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { Emoji } from './Emoji';
import type { EmojiEntry } from './emojiData';

type EmojiGridRowProps = {
  emojis: EmojiEntry[];
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
  buttonSize: number;
};

export const EmojiGridRow = React.memo(function EmojiGridRow({
  emojis,
  onSelect,
  selectedEmoji,
  buttonSize,
}: EmojiGridRowProps) {
  if (emojis.length === 0) return null;

  return (
    <View
      style={[Atoms.flex_row, Atoms.justify_start, Atoms.gap_2xs, Atoms.py_xs]}
    >
      {emojis.map((entry) => (
        <Emoji
          key={entry.code.join('-')}
          emoji={entry.emoji}
          onPress={() => onSelect(entry.emoji)}
          selected={selectedEmoji === entry.emoji}
          size={buttonSize}
        />
      ))}
    </View>
  );
});
