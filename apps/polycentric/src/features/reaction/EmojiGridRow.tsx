import { Atoms } from '@/src/common/theme';
import React from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Emoji } from './Emoji';
import { EMOJI_FONT_SIZE, GRID_COLUMNS, type EmojiEntry } from './emojiData';

const CELL_WIDTH = `${100 / GRID_COLUMNS}%` as const;

type EmojiGridRowProps = {
  emojis: EmojiEntry[];
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
  color: string;
  highlightColor: string;
  onLayout?: (e: LayoutChangeEvent) => void;
};

export const EmojiGridRow = React.memo(function EmojiGridRow({
  emojis,
  onSelect,
  selectedEmoji,
  color,
  highlightColor,
  onLayout,
}: EmojiGridRowProps) {
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
          size={CELL_WIDTH}
          style={[Atoms.text_center, { fontSize: EMOJI_FONT_SIZE }]}
        />
      ))}
    </View>
  );
});
