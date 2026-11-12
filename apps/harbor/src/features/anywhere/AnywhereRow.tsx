import { Image } from '@/src/common/components/Image';
import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { urlHost } from '@/src/common/util/anywhere-url';
import { type Href, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import {
  commentCountLabel,
  rememberCommentCount,
} from './hooks/useAnywhereCommentCount';
import { useAnywhereLink } from './hooks/useAnywhereLink';
import type { AnywhereFeedItem } from './hooks/useAttributedToFeed';

const THUMBNAIL_SIZE = 64;

/** A commented-on web page in a list; opens its comments. */
export function AnywhereRow({ link: known, postCount }: AnywhereFeedItem) {
  const { theme } = useTheme();
  const client = usePolycentric();
  const unfurled = useAnywhereLink(
    known.title && known.image ? undefined : known.url,
    known,
  );
  const link = unfurled.link ?? known;
  // Through the server's image proxy, as link previews are.
  const imageUris = useMemo(
    () => (link.image ? client.imageProxyUrls(link.image) : []),
    [client, link.image],
  );

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        rememberCommentCount(link.url, postCount);
        router.navigate(Routes.tabs.anywhere.url(link.url) as Href);
      }}
      style={({ pressed }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_md,
        {
          borderBottomWidth: 1,
          borderBottomColor: theme.palette.neutral_25,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[Atoms.flex_1, Atoms.gap_xs]}>
        <Text fontWeight="bold" numberOfLines={2}>
          {link.title || link.url}
        </Text>
        <Text variant="secondary" color="neutral_500" numberOfLines={1}>
          {commentCountLabel(postCount)} · {urlHost(link.url) ?? link.url}
        </Text>
      </View>
      {imageUris.length > 0 ? (
        <Image
          uris={imageUris}
          contentFit="cover"
          style={[
            Atoms.rounded_md,
            {
              width: THUMBNAIL_SIZE,
              height: THUMBNAIL_SIZE,
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}
