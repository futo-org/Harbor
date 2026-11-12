import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { resolveImageSources } from '@/src/common/components/ImageViewer';
import { Atoms } from '@/src/common/theme';
import {
  MAX_ASPECT_RATIO,
  MIN_ASPECT_RATIO,
} from '@/src/common/lib/images/attachmentLayout';
import { MAX_ATTACHMENTS } from '@/src/common/lib/images/useImageAttachments';
import type { v2 } from '@polycentric/react-native';
import { memo, useMemo } from 'react';
import { Image } from '@/src/common/components/Image';
import { Pressable, View } from 'react-native';

/** Target pixel size we want for displayed attachments. */
const IMAGE_TARGET = 512;
/** Aspect ratio of the whole grid when there are 2+ images. */
const GRID_ASPECT = 16 / 9;
/** Pixel gutter between grid tiles. */
const GRID_GAP = 2;
const TILE_BG = 'rgba(0,0,0,0.04)';

/**
 * Image grid for attached images (posts, claims). Twitter-style layouts for
 * 1-4 images; extras are dropped (matches the composer's `MAX_ATTACHMENTS`).
 * Tapping a tile calls `onOpenImage` with its index.
 */
export const ImageGrid = memo(function ImageGrid({
  images,
  onOpenImage,
}: {
  images: v2.ImageSet[];
  onOpenImage: (index: number) => void;
}) {
  const client = usePolycentric();
  const capped = useMemo(() => images.slice(0, MAX_ATTACHMENTS), [images]);
  const sources = useMemo(
    () =>
      resolveImageSources(
        capped,
        (digest) => client.blobUrls(digest),
        IMAGE_TARGET,
      ),
    [client, capped],
  );

  if (sources.length === 0) return null;

  // Single image: render at its natural aspect, clamped so a super-tall
  // or super-wide upload doesn't blow out the card.
  if (sources.length === 1) {
    return (
      <Pressable
        // unstable_pressDelay={300}
        onPress={(e) => {
          e.stopPropagation?.();
          onOpenImage(0);
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
          <GridTile uris={sources[0].uris} index={0} onOpen={onOpenImage} />
          <GridTile uris={sources[1].uris} index={1} onOpen={onOpenImage} />
        </>
      ) : sources.length === 3 ? (
        <>
          <GridTile uris={sources[0].uris} index={0} onOpen={onOpenImage} />
          <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
            <GridTile uris={sources[1].uris} index={1} onOpen={onOpenImage} />
            <GridTile uris={sources[2].uris} index={2} onOpen={onOpenImage} />
          </View>
        </>
      ) : (
        <>
          <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
            <GridTile uris={sources[0].uris} index={0} onOpen={onOpenImage} />
            <GridTile uris={sources[2].uris} index={2} onOpen={onOpenImage} />
          </View>
          <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
            <GridTile uris={sources[1].uris} index={1} onOpen={onOpenImage} />
            <GridTile uris={sources[3].uris} index={3} onOpen={onOpenImage} />
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
        // Stop the outer card press from also firing.
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
