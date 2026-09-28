import { EmojiSprite } from '@/modules/emoji-sprite';
import { EmojiImage } from '@/src/common/components/EmojiImage';
import {
  SHEET_INDEX,
  SPRITE_PAGE_CELLS,
} from '@/src/common/emoji/twemoji/sheet';
import { twemojiCode } from '@/src/common/util/emoji';

type Props = {
  sequence: string;
  size: number;
};

/**
 * The picker's emoji glyph, drawn from a shared sprite page so opening the
 * picker decodes a few pages rather than an image per cell. Emoji missing
 * from the pages (skin tones, newer additions) use their own image.
 */
export function EmojiPickerImage({ sequence, size }: Props) {
  const sheetIndex = SHEET_INDEX[twemojiCode(sequence)];
  if (sheetIndex === undefined)
    return <EmojiImage sequence={sequence} size={size} />;

  return (
    <EmojiSprite
      page={Math.floor(sheetIndex / SPRITE_PAGE_CELLS)}
      cell={sheetIndex % SPRITE_PAGE_CELLS}
      style={{ width: size, height: size }}
      accessibilityLabel={sequence}
      testID="emoji"
    />
  );
}
