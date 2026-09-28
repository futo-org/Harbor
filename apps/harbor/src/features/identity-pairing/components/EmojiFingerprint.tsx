import { EmojiImage } from '@/src/common/components/EmojiImage';
import { Atoms } from '@/src/common/theme';
import { publicKeyEmojiFingerprint } from '@/src/features/identity-pairing/publicKeyEmojiFingerprint';
import { View } from 'react-native';

type Props = {
  publicKey: string;
  size: number;
};

/** The three-emoji fingerprint users compare across devices when pairing. */
export function EmojiFingerprint({ publicKey, size }: Props) {
  const emojis = publicKeyEmojiFingerprint(publicKey);
  return (
    <View
      accessible
      accessibilityLabel={emojis.join(' ')}
      style={[
        Atoms.flex_row,
        Atoms.justify_center,
        // Room for the glyphs, which are wider than their size.
        { gap: size / 3 },
      ]}
    >
      {emojis.map((emoji, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the same emoji can repeat
        <EmojiImage key={index} sequence={emoji} size={size} />
      ))}
    </View>
  );
}
