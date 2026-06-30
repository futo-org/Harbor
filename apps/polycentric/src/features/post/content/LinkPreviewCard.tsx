import { Text } from '@/src/common/components/primitives';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { v2 } from '@polycentric/react-native';
import { Image } from '@/src/common/components/Image';
import { Linking, Pressable, View } from 'react-native';

const IMAGE_BG = 'rgba(0,0,0,0.04)';
/** Open-Graph standard image ratio (1200×630). */
const OG_ASPECT = 1.91;

/**
 * Open-Graph style preview card for a `Link` attached to a post.
 * Tapping opens the URL; the tap is stopped from also triggering the surrounding
 * post-card press (same pattern as PostImages).
 *
 * Metadata fields are best-effort — proto3 leaves unset strings empty, so each
 * is rendered only when present.
 */
export function LinkPreviewCard({ link }: { link: v2.Link }) {
  const { theme } = useTheme();
  const client = usePolycentric();

  // Load the thumbnail through the server image proxy rather
  // than hotlinking the third-party host directly.
  const imageUris = link.image ? client.imageProxyUrls(link.image) : [];

  let host = link.url;
  try {
    host = new URL(link.url).hostname;
  } catch {
    // Leave host as the raw URL if it doesn't parse.
  }

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        void Linking.openURL(link.url).catch(() => {});
      }}
      style={({ pressed }) => [
        Atoms.rounded_md,
        Atoms.mt_md,
        Atoms.overflow_hidden,
        {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '30'),
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {imageUris.length > 0 ? (
        <Image
          testID="linkPreviewImage"
          uris={imageUris}
          contentFit="cover"
          style={[
            Atoms.w_full,
            { aspectRatio: OG_ASPECT, backgroundColor: IMAGE_BG },
          ]}
        />
      ) : null}
      <View style={Atoms.p_md}>
        <Text variant="small" color="neutral_500">
          {host}
        </Text>
        {link.title ? (
          <Text
            variant="secondary"
            fontWeight="bold"
            numberOfLines={2}
            style={[Atoms.mt_xs, theme.atoms.text_neutral_high]}
          >
            {link.title}
          </Text>
        ) : null}
        {link.description ? (
          <Text
            variant="secondary"
            color="neutral_500"
            numberOfLines={2}
            style={Atoms.mt_xs}
          >
            {link.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
