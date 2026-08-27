import {
  usePolycentric,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { resolveImageSources } from '@/src/common/components/ImageViewer';
import { Atoms } from '@/src/common/theme';
import {
  MAX_ASPECT_RATIO,
  MIN_ASPECT_RATIO,
} from '@/src/features/composer/utils/attachmentLayout';
import { MAX_ATTACHMENTS } from '@/src/features/composer/hooks/useComposer';
import { openPostImage } from '@/src/features/post/PostImageViewerScreen';
import { memo, useCallback, useMemo } from 'react';
import { Image } from '@/src/common/components/Image';
import { Pressable, View } from 'react-native';

/** Target pixel size we want for displayed attachments. */
const POST_IMAGE_TARGET = 512;
/** Aspect ratio of the whole grid when there are 2+ images. */
const GRID_ASPECT = 16 / 9;
/** Pixel gutter between grid tiles. */
const GRID_GAP = 2;
const TILE_BG = 'rgba(0,0,0,0.04)';

/**
 * Image grid for a post. Twitter-style layouts for 1–4 images; extras
 * are dropped (matches the composer's `MAX_ATTACHMENTS`). Tapping any
 * tile opens the full-screen `ImageViewer`.
 */
export const PostImages = memo(function PostImages({
  post,
}: {
  post: PostData;
}) {
  const client = usePolycentric();
  const capped = useMemo(
    () => post.images.slice(0, MAX_ATTACHMENTS),
    [post.images],
  );
  const sources = useMemo(
    () =>
      resolveImageSources(
        capped,
        (digest) => client.blobUrls(digest),
        POST_IMAGE_TARGET,
      ),
    [client, capped],
  );

  const openViewer = useCallback((i: number) => openPostImage(post, i), [post]);

  if (sources.length === 0) return null;

  // Single image: render at its natural aspect, clamped so a super-tall
  // or super-wide upload doesn't blow out the card.
  if (sources.length === 1) {
    return (
      <Pressable
        // unstable_pressDelay={300}
        onPress={(e) => {
          e.stopPropagation?.();
          openViewer(0);
        }}
        style={({ pressed }) => [
          Atoms.w_full,
          Atoms.rounded_md,
          Atoms.mt_sm,
          pressed && { opacity: 0.8 },
        ]}
      >
        <Image
          uris={sources[0].uris}
          contentFit="contain"
          style={[
            Atoms.w_full,
            Atoms.rounded_md,
            {
              aspectRatio: Math.min(
                MAX_ASPECT_RATIO,
                Math.max(sources[0].aspectRatio ?? 1, MIN_ASPECT_RATIO),
              ),
              backgroundColor: TILE_BG,
            },
          ]}
        />
      </Pressable>
    );
  }

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.flex_row,
        Atoms.rounded_md,
        Atoms.overflow_hidden,
        Atoms.mt_sm,
        {
          aspectRatio: GRID_ASPECT,
          gap: GRID_GAP,
          backgroundColor: TILE_BG,
        },
      ]}
    >
      {sources.length === 2 ? (
        <>
          <GridTile uris={sources[0].uris} index={0} onOpen={openViewer} />
          <GridTile uris={sources[1].uris} index={1} onOpen={openViewer} />
        </>
      ) : sources.length === 3 ? (
        <>
          <GridTile uris={sources[0].uris} index={0} onOpen={openViewer} />
          <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
            <GridTile uris={sources[1].uris} index={1} onOpen={openViewer} />
            <GridTile uris={sources[2].uris} index={2} onOpen={openViewer} />
          </View>
        </>
      ) : (
        <>
          <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
            <GridTile uris={sources[0].uris} index={0} onOpen={openViewer} />
            <GridTile uris={sources[2].uris} index={2} onOpen={openViewer} />
          </View>
          <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
            <GridTile uris={sources[1].uris} index={1} onOpen={openViewer} />
            <GridTile uris={sources[3].uris} index={3} onOpen={openViewer} />
          </View>
        </>
      )}
    </View>
  );
});

function GridTile({
  uris,
  index,
  onOpen,
}: {
  uris: string[];
  index: number;
  onOpen: (index: number) => void;
}) {
  return (
    <Pressable
      onPress={(e) => {
        // Stop the outer post-card press from also firing.
        e.stopPropagation?.();
        onOpen(index);
      }}
      style={({ pressed }) => [Atoms.flex_1, pressed && { opacity: 0.8 }]}
    >
      <Image
        uris={uris}
        contentFit="cover"
        style={[Atoms.w_full, Atoms.h_full, { backgroundColor: TILE_BG }]}
      />
    </Pressable>
  );
}
