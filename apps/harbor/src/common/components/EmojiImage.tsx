import { twemojiFontFamily } from '@/src/common/assets/twemojiFontFamily';
import {
  TWEMOJI_SPACE_AFTER,
  TWEMOJI_SPACE_BEFORE,
} from '@/src/common/assets/twemojiFont';
import { memo } from 'react';
import { Text } from 'react-native';

type Props = {
  sequence: string;
  size: number;
};

/** One emoji in a `size` square, drawn with the Twemoji font. */
export const EmojiImage = memo(function EmojiImage({ sequence, size }: Props) {
  return (
    <Text
      accessibilityLabel={sequence}
      testID="emoji"
      // The box is `size`, whatever the system text size.
      allowFontScaling={false}
      style={{
        fontFamily: twemojiFontFamily,
        fontSize: size,
        // The font's ascent and descent are its 1em glyph, so the glyph
        // fills the line.
        lineHeight: size,
        // Trims the font's space around the glyph, leaving its 1em square.
        marginLeft: -TWEMOJI_SPACE_BEFORE * size,
        marginRight: -TWEMOJI_SPACE_AFTER * size,
      }}
    >
      {sequence}
    </Text>
  );
});
