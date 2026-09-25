import { TWEMOJI } from '@/src/common/emoji/twemoji';
import { twemojiCode } from '@/src/common/util/emoji';
import { isAndroid } from '@/src/common/util/platform';
import {
  Image as ExpoImage,
  type ImageProps as ExpoImageProps,
} from 'expo-image';
import { memo } from 'react';
import { Image, Text } from 'react-native';

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
  if (!source) return <Text style={{ fontSize: size * 0.85 }}>{sequence}</Text>;

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
