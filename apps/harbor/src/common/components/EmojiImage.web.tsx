import { TWEMOJI_SPACE_BEFORE } from '@/src/common/assets/twemojiSpacing';
import { memo } from 'react';

type Props = {
  sequence: string;
  size: number;
};

/** One emoji in a `size` square, drawn with the Twemoji font (see `app/+html.tsx`). */
export const EmojiImage = memo(function EmojiImage({ sequence, size }: Props) {
  return (
    <span
      role="img"
      aria-label={sequence}
      data-testid="emoji"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        fontFamily: 'TwemojiImage',
        fontSize: size,
        // The font's ascent and descent are its 1em glyph, so the glyph
        // fills the line.
        lineHeight: 1,
        // The glyph starts after the font's space before it; the space after
        // it overflows the box unseen.
        textIndent: `${-TWEMOJI_SPACE_BEFORE}em`,
      }}
    >
      {sequence}
    </span>
  );
});
