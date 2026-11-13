import { Text } from '@/src/common/components/primitives';
import { memo, useMemo } from 'react';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import type { v2 } from '@polycentric/react-native';
import { Image } from '@/src/common/components/Image';
import { Linking, Pressable, View } from 'react-native';

/** Open-Graph standard image ratio (1200×630). */
const OG_ASPECT = 1.91;
/** Thumbnail width when `compact` places the image beside the text. */
export const COMPACT_IMAGE_WIDTH = 96;

/**
 * Open-Graph style preview card for a `Link` attached to a post.
 * Tapping opens the URL; the tap is stopped from also triggering the surrounding
 * post-card press (same pattern as PostImages).
 *
 * Metadata fields are best-effort — proto3 leaves unset strings empty, so each
 * is rendered only when present.
 *
 * With `compact`, the image is a fixed-width thumbnail on the right of the
 * text instead of a full-width banner above it.
 */
export const LinkPreviewCard = memo(function LinkPreviewCard({
  link,
  compact = false,
}: {
  link: v2.Link;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const client = usePolycentric();

  // Load the thumbnail through the server image proxy rather
  // than hotlinking the third-party host directly.
  const imageUris = useMemo(
    () => (link.image ? client.imageProxyUrls(link.image) : []),
    [client, link.image],
  );

  const host = useMemo(() => {
    try {
      return new URL(link.url).hostname;
    } catch {
      // Fall back to the raw URL if it doesn't parse.
      return link.url;
    }
  }, [link.url]);

  const image =
    imageUris.length > 0 ? (
      <Image
        testID="linkPreviewImage"
        uris={imageUris}
        contentFit="cover"
        style={
          compact
            ? [
                Atoms.self_stretch,
                theme.atoms_new.box.neutral.bg_subtle,
                { width: COMPACT_IMAGE_WIDTH },
              ]
            : [
                Atoms.w_full,
                theme.atoms_new.box.neutral.bg_subtle,
                { aspectRatio: OG_ASPECT },
              ]
        }
      />
    ) : null;

  const text = (
    <View style={[Atoms.p_md, compact && Atoms.flex_1]}>
      <Text variant="small" color="muted">
        {host}
      </Text>
      {link.title ? (
        <Text
          variant="secondary"
          fontWeight="bold"
          numberOfLines={2}
          style={Atoms.mt_xs}
        >
          {link.title}
        </Text>
      ) : null}
      {link.description ? (
        <Text
          variant="secondary"
          color="muted"
          numberOfLines={2}
          style={Atoms.mt_xs}
        >
          {link.description}
        </Text>
      ) : null}
    </View>
  );

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
        compact && Atoms.flex_row,
        theme.atoms_new.box.neutral.border_subtle,
        { borderWidth: 1 },
        pressed && theme.atoms_new.faded_subtle,
      ]}
    >
      {compact ? (
        <>
          {text}
          {image}
        </>
      ) : (
        <>
          {image}
          {text}
        </>
      )}
    </Pressable>
  );
});
