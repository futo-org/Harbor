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
        // The glyph starts 0.1em into its advance.
        textIndent: '-0.1em',
      }}
    >
      {sequence}
    </span>
  );
});
