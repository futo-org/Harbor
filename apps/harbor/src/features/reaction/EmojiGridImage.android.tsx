import { EmojiSprite } from '@/modules/emoji-sprite';
import { EmojiImage } from '@/src/common/components/EmojiImage';
import {
  SHEET_INDEX,
  SPRITE_PAGE_STARTS,
} from '@/src/common/emoji/twemoji/sheet';
import { twemojiCode } from '@/src/common/util/emoji';

type Props = {
  sequence: string;
  size: number;
};

/**
 * An emoji in the picker sheet's grid, drawn from a shared sprite page so
 * opening the sheet decodes a few pages rather than an image per cell. Emoji
 * missing from the pages (skin tones, newer additions) use their own image.
 */
export function EmojiGridImage({ sequence, size }: Props) {
  const sheetIndex = SHEET_INDEX[twemojiCode(sequence)];
  if (sheetIndex === undefined)
    return <EmojiImage sequence={sequence} size={size} />;

  const page = SPRITE_PAGE_STARTS.findLastIndex(
    (pageStart) => pageStart <= sheetIndex,
  );

  return (
    <EmojiSprite
      page={page}
      cell={sheetIndex - SPRITE_PAGE_STARTS[page]}
      style={{ width: size, height: size }}
      accessibilityLabel={sequence}
      testID="emoji"
    />
  );
}
