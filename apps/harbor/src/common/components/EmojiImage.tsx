import { TWEMOJI } from '@/src/common/emoji/twemoji';
import { Atoms } from '@/src/common/theme';
import { TWEMOJI_ENABLED, twemojiCode } from '@/src/common/util/emoji';
import { isAndroid } from '@/src/common/util/platform';
import {
  Image as ExpoImage,
  type ImageProps as ExpoImageProps,
} from 'expo-image';
import { memo } from 'react';
import { Image, Text, View } from 'react-native';

// Room around the platform glyph, which is wider than its font size.
const GLYPH_BOX_SCALE = 1.5;

type Props = {
  sequence: string;
  size: number;
  style?: ExpoImageProps['style'];
};

/** A Twemoji image for one emoji; falls back to the platform glyph. */
export const EmojiImage = memo(function EmojiImage({
  sequence,
  size,
  style,
}: Props) {
  const source = TWEMOJI[twemojiCode(sequence)];
  if (!TWEMOJI_ENABLED || !source)
    return <Glyph sequence={sequence} size={size} />;

  // Android's RN Image fades in and re-decodes recycled cells, so the
  // picker grid flickers; expo-image keeps decoded emojis in memory.
  if (isAndroid)
    return (
      <ExpoImage
        source={source}
        contentFit="contain"
        cachePolicy="memory"
        style={[{ width: size, height: size }, style]}
        accessibilityLabel={sequence}
        testID="emoji"
      />
    );

  return (
    <Image
      source={source}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
      accessibilityLabel={sequence}
      testID="emoji"
    />
  );
});

/** The platform glyph, centered in the image's size x size footprint. */
function Glyph({ sequence, size }: { sequence: string; size: number }) {
  const box = Math.round(size * GLYPH_BOX_SCALE);
  const offset = (size - box) / 2;
  return (
    <View style={{ width: size, height: size }}>
      {/* A fixed box, not a measured one: Android measures without EmojiCompat,
          so an emoji missing from the system font gets a missing-glyph-wide
          box and EmojiCompat's wider drawing of it is clipped. */}
      <Text
        style={[
          Atoms.absolute,
          Atoms.text_center,
          {
            left: offset,
            top: offset,
            width: box,
            height: box,
            lineHeight: box,
            fontSize: size,
            textAlignVertical: 'center',
            includeFontPadding: false,
          },
        ]}
      >
        {sequence}
      </Text>
    </View>
  );
}
