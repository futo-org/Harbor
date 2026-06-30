import {
  pickImageVariant,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useImageViewer } from '@/src/common/components/ImageViewer';
import { v2 } from '@polycentric/react-native';
import { useCallback, useMemo } from 'react';
import { Image } from '@/src/common/components/Image';
import { Pressable, View } from 'react-native';

/** Target pixel size we want for displayed attachments. */
const POST_IMAGE_TARGET = 512;
/** Aspect ratio of the whole grid when there are 2+ images. */
const GRID_ASPECT = 16 / 9;
/** Pixel gutter between grid tiles. */
const GRID_GAP = 2;
const TILE_BG = 'rgba(0,0,0,0.04)';

type PostImageSource = {
  uris: string[];
  aspectRatio: number;
};

/**
 * Image grid for a post. Twitter-style layouts for 1–4 images; extras
 * are dropped (matches the composer's `MAX_ATTACHMENTS`). Tapping any
 * tile opens the full-screen `ImageViewer`.
 */
export function PostImages({ images }: { images: v2.ImageSet[] }) {
  const client = usePolycentric();
  const capped = useMemo(() => images.slice(0, 4), [images]);
  const sources = useMemo<PostImageSource[]>(
    () =>
      capped
        .map((imageSet) => {
          const variant = pickImageVariant(imageSet, POST_IMAGE_TARGET);
          const digest = variant?.blob?.digest;
          if (!digest) return null;
          const uris = client.blobUrls(digest);
          if (uris.length === 0) return null;
          const w = variant.width || 1;
          const h = variant.height || 1;
          return { uris, aspectRatio: w / h };
        })
        .filter((s): s is PostImageSource => s != null),
    [client, capped],
  );

  const showViewer = useImageViewer();
  const openViewer = useCallback(
    (i: number) => showViewer(capped, i),
    [showViewer, capped],
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
          contentFit="cover"
          style={[
            Atoms.w_full,
            Atoms.rounded_md,
            {
              aspectRatio: Math.max(
                0.75,
                Math.min(sources[0].aspectRatio, 1.8),
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
}

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
