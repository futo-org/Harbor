import { TWEMOJI } from '@/src/common/emoji/twemoji';
import { CopyOnlyText } from '@/src/common/components/primitives/CopyOnlyText';
import { twemojiCode } from '@/src/common/util/emoji';
import { memo } from 'react';
import { Image, type ImageStyle, type StyleProp, Text } from 'react-native';

type Props = {
  sequence: string;
  size: number;
  style?: StyleProp<ImageStyle>;
  // Inline in selectable text: copying a selection includes the emoji.
  copyable?: boolean;
};

/** A Twemoji image for one emoji; falls back to the platform glyph. */
export const EmojiImage = memo(function EmojiImage({
  sequence,
  size,
  style,
  copyable,
}: Props) {
  const source = TWEMOJI[twemojiCode(sequence)];
  if (!source) return <Text style={{ fontSize: size * 0.85 }}>{sequence}</Text>;
  return (
    <>
      <Image
        source={source}
        resizeMode="contain"
        style={[{ width: size, height: size }, style]}
        accessibilityLabel={sequence}
        testID="emoji"
        // Inline in text, touches go to the text (a link around the emoji, text
        // selection) rather than stopping at the image.
        {...(copyable ? { pointerEvents: 'none' } : {})}
      />
      {copyable ? <CopyOnlyText>{sequence}</CopyOnlyText> : null}
    </>
  );
});
