import Icon from '@/src/common/components/Icon';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useCallback } from 'react';
import { View } from 'react-native';
import { Emoji, EmojiLikeButton } from './Emoji';
import { INLINE_EMOJIS } from './emojiData';

/** The size (width/height) of an inline emoji picker button */
const INLINE_SIZE = 36;

type EmojiPickerInlineProps = {
  selectedEmoji?: string | null;
  onSelect?: (emoji: string) => void;
  onShowMore?: () => void;
};

export default function EmojiPickerInline({
  selectedEmoji,
  onSelect,
  onShowMore,
}: EmojiPickerInlineProps) {
  const { theme } = useTheme();

  const handleSelect = useCallback(
    (emoji: string) => onSelect?.(emoji),
    [onSelect],
  );

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
      {INLINE_EMOJIS.map((emoji) => (
        <Emoji
          key={emoji.name}
          emoji={emoji.emoji}
          onSelect={handleSelect}
          size={INLINE_SIZE}
          selected={selectedEmoji === emoji.emoji}
          color={theme.palette.neutral_1000}
          highlightColor={theme.palette.neutral_100}
        />
      ))}
      {onShowMore && (
        <EmojiLikeButton
          onPress={onShowMore}
          size={INLINE_SIZE}
          hitSlop={Spacing.sm}
          highlightColor={theme.palette.neutral_100}
        >
          <Icon name="dotsVertical" size={20} color="neutral_1000" />
        </EmojiLikeButton>
      )}
    </View>
  );
}
