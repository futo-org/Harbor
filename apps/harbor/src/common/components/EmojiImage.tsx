import { CopyOnlyText } from '@/src/common/components/primitives/CopyOnlyText';
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
  // Inline in text: touches go to the text (a link around the emoji, text
  // selection) rather than stopping at the image.
  inText?: boolean;
  // Inline in selectable text: copying a selection includes the emoji.
  copyable?: boolean;
};

/** A Twemoji image for one emoji; falls back to the platform glyph. */
export const EmojiImage = memo(function EmojiImage({
  sequence,
  size,
  style,
  inText,
  copyable,
}: Props) {
  const source = TWEMOJI[twemojiCode(sequence)];
  if (!source) return <Text style={{ fontSize: size * 0.85 }}>{sequence}</Text>;

  const imageProps = {
    style: [{ width: size, height: size }, style],
    accessibilityLabel: sequence,
    testID: 'emoji',
    ...(inText ? { pointerEvents: 'none' as const } : {}),
  };

  return (
    <>
      {isAndroid ? (
        // Android's RN Image fades in and re-decodes recycled cells, so the
        // picker grid flickers; expo-image keeps decoded emojis in memory.
        <ExpoImage
          source={source}
          contentFit="contain"
          cachePolicy="memory"
          {...imageProps}
        />
      ) : (
        <Image source={source} resizeMode="contain" {...imageProps} />
      )}
      {copyable ? <CopyOnlyText>{sequence}</CopyOnlyText> : null}
    </>
  );
});
