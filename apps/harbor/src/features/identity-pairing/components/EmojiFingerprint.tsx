import { EmojiImage } from '@/src/common/components/EmojiImage';
import { Atoms, useTheme } from '@/src/common/theme';
import { publicKeyEmojiFingerprint } from '@/src/features/identity-pairing/publicKeyEmojiFingerprint';
import { ActivityIndicator, View } from 'react-native';

const EMOJI_SIZE = 60;

export function EmojiFingerprint({
  publicKey,
  bare = false,
}: {
  publicKey: string | undefined;
  bare?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.gap_lg,
        Atoms.flex_wrap,
        !bare && [
          Atoms.rounded_lg,
          Atoms.p_lg,
          { backgroundColor: theme.palette.white },
        ],
      ]}
    >
      {publicKey === undefined ? (
        <View style={[Atoms.justify_center, { height: EMOJI_SIZE }]}>
          <ActivityIndicator />
        </View>
      ) : (
        publicKeyEmojiFingerprint(publicKey).map((emoji, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: short emoji sequence that doesn't reorder
          <EmojiImage key={i} sequence={emoji} size={EMOJI_SIZE} />
        ))
      )}
    </View>
  );
}
