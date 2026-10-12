import { twemojiFontFamily } from '@/src/common/assets/twemojiFontFamily';
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
        // The glyph sits 0.1em into its 1.15em advance.
        marginLeft: -0.1 * size,
        marginRight: -0.05 * size,
      }}
    >
      {sequence}
    </Text>
  );
});
