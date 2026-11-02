import { EmojiSprite } from '@/modules/emoji-sprite';
import { EmojiImage } from '@/src/common/components/EmojiImage';
import {
  SPRITE_EMOJIS,
  SPRITE_PAGE_COLUMNS,
  SPRITE_PAGE_STARTS,
} from '@/src/common/emoji/sheet';

type Props = {
  sequence: string;
  size: number;
};

/**
 * An emoji in the picker sheet's grid, drawn from a shared sprite page so
 * scrolling blits bitmaps instead of drawing font glyphs, which is much slower
 * on Android.
 */
export function EmojiGridImage({ sequence, size }: Props) {
  const sheetIndex = getSheetIndexByEmojiMap().get(sequence);
  // Not expected: the pages hold every picker emoji.
  if (sheetIndex === undefined)
    return <EmojiImage sequence={sequence} size={size} />;

  const page = SPRITE_PAGE_STARTS.findLastIndex(
    (pageStart) => pageStart <= sheetIndex,
  );

  return (
    <EmojiSprite
      page={page}
      cell={sheetIndex - SPRITE_PAGE_STARTS[page]}
      pageColumns={SPRITE_PAGE_COLUMNS}
      style={{ width: size, height: size }}
      accessibilityLabel={sequence}
      testID="emoji"
    />
  );
}

let sheetIndexByEmojiMap: Map<string, number> | undefined;

function getSheetIndexByEmojiMap(): Map<string, number> {
  if (!sheetIndexByEmojiMap) {
    sheetIndexByEmojiMap = new Map(
      SPRITE_EMOJIS.map((emoji, sheetIndex) => [emoji, sheetIndex]),
    );
  }
  return sheetIndexByEmojiMap;
}
