import { Text } from '@/src/common/components/primitives';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Image, Linking, Pressable, View } from 'react-native';

export type LinkPreview = {
  url: string;
  title: string;
  description?: string;
  /** Already resolved to a displayable URI (raw URL or blob URL). */
  imageUrl?: string;
};

const IMAGE_BG = 'rgba(0,0,0,0.04)';
/** Open-Graph standard image ratio (1200×630). */
const OG_ASPECT = 1.91;

/**
 * Open-Graph style preview card for a link in a post. Tapping opens the
 * URL; the tap is stopped from also triggering the surrounding post-card
 * press (same pattern as PostImages).
 */
export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const { theme } = useTheme();

  let host = preview.url;
  try {
    host = new URL(preview.url).hostname;
  } catch {
    // Leave host as the raw URL if it doesn't parse.
  }

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        void Linking.openURL(preview.url).catch(() => {});
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
      {preview.imageUrl ? (
        <Image
          source={{ uri: preview.imageUrl }}
          resizeMode="cover"
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
        <Text
          variant="secondary"
          fontWeight="bold"
          numberOfLines={2}
          style={[Atoms.mt_xs, theme.atoms.text_neutral_high]}
        >
          {preview.title}
        </Text>
        {preview.description ? (
          <Text
            variant="secondary"
            color="neutral_500"
            numberOfLines={2}
            style={Atoms.mt_xs}
          >
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
