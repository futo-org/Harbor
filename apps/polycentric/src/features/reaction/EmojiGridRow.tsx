import { Atoms } from '@/src/common/theme';
import React from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Emoji } from './Emoji';
import { EMOJI_FONT_SIZE, type EmojiEntry } from './emojiData';

type EmojiGridRowProps = {
  emojis: EmojiEntry[];
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
  color: string;
  highlightColor: string;
  /** Number of columns in the grid; sets each cell's width. */
  columns: number;
  onLayout?: (e: LayoutChangeEvent) => void;
};

export const EmojiGridRow = React.memo(function EmojiGridRow({
  emojis,
  onSelect,
  selectedEmoji,
  color,
  highlightColor,
  columns,
  onLayout,
}: EmojiGridRowProps) {
  const cellWidth = `${100 / columns}%`;
  return (
    <View style={Atoms.flex_row} onLayout={onLayout}>
      {emojis.map((entry) => (
        <Emoji
          key={entry.code.join('-')}
          emoji={entry.emoji}
          onSelect={onSelect}
          selected={selectedEmoji === entry.emoji}
          color={color}
          highlightColor={highlightColor}
          size={cellWidth}
          style={[Atoms.text_center, { fontSize: EMOJI_FONT_SIZE }]}
        />
      ))}
    </View>
  );
});
