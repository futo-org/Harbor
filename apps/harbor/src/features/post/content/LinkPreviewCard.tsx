import { Text } from '@/src/common/components/primitives';
import { memo, useMemo } from 'react';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import type { v2 } from '@polycentric/react-native';
import { Image } from '@/src/common/components/Image';
import { urlHost } from '@/src/common/util/anywhere-url';
import { isWeb } from '@/src/common/util/platform';
import { Linking, Pressable, View } from 'react-native';

/** Open-Graph standard image ratio (1200×630). */
const OG_ASPECT = 1.91;
/** Thumbnail width when `compact` places the image beside the text. */
export const COMPACT_IMAGE_WIDTH = 96;

/**
 * Open-Graph style preview card for a `Link` attached to a post. On web it's
 * an anchor opening the URL in a new tab; on native a press opens it. Either
 * way the press doesn't reach the surrounding post card.
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

  const host = urlHost(link.url) ?? link.url;

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
                theme.atoms.box.raised.bg,
                { width: COMPACT_IMAGE_WIDTH },
              ]
            : [
                Atoms.w_full,
                theme.atoms.box.raised.bg,
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
      // The Pressable keeps the click from the post card and lets the browser
      // follow the link.
      href={isWeb ? link.url : undefined}
      hrefAttrs={isWeb ? { target: '_blank' } : undefined}
      onPress={
        isWeb
          ? undefined
          : (e) => {
              e.stopPropagation?.();
              void Linking.openURL(link.url).catch(() => {});
            }
      }
      style={({ pressed }) => [
        Atoms.rounded_md,
        Atoms.mt_md,
        Atoms.overflow_hidden,
        compact && Atoms.flex_row,
        theme.atoms.outline,
        Atoms.border,
        pressed && Atoms.faded_subtle,
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
