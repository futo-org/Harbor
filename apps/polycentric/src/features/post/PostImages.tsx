import {
  pickImageVariant,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { v2 } from '@polycentric/react-native';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { ImageViewer } from './ImageViewer';

/** Target pixel size we want for displayed attachments. */
const POST_IMAGE_TARGET = 512;
/** Aspect ratio of the whole grid when there are 2+ images. */
const GRID_ASPECT = 16 / 9;
/** Pixel gutter between grid tiles. */
const GRID_GAP = 2;
const TILE_BG = 'rgba(0,0,0,0.04)';

type PostImageSource = {
  uri: string;
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
          const uri = client.blobUrl(digest);
          if (!uri) return null;
          const w = variant.width || 1;
          const h = variant.height || 1;
          return { uri, aspectRatio: w / h };
        })
        .filter((s): s is PostImageSource => s != null),
    [client, capped],
  );

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const openViewer = useCallback((i: number) => setViewerIndex(i), []);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  if (sources.length === 0) return null;

  const viewer =
    viewerIndex !== null ? (
      <ImageViewer
        images={capped}
        initialIndex={viewerIndex}
        onClose={closeViewer}
      />
    ) : null;

  // Single image: render at its natural aspect, clamped so a super-tall
  // or super-wide upload doesn't blow out the card.
  if (sources.length === 1) {
    return (
      <>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            openViewer(0);
          }}
          style={[Atoms.w_full, Atoms.rounded_md, Atoms.mt_sm]}
        >
          <Image
            source={{ uri: sources[0].uri }}
            resizeMode="cover"
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
        {viewer}
      </>
    );
  }

  return (
    <>
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
            <GridTile uri={sources[0].uri} onPress={() => openViewer(0)} />
            <GridTile uri={sources[1].uri} onPress={() => openViewer(1)} />
          </>
        ) : sources.length === 3 ? (
          <>
            <GridTile uri={sources[0].uri} onPress={() => openViewer(0)} />
            <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
              <GridTile uri={sources[1].uri} onPress={() => openViewer(1)} />
              <GridTile uri={sources[2].uri} onPress={() => openViewer(2)} />
            </View>
          </>
        ) : (
          <>
            <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
              <GridTile uri={sources[0].uri} onPress={() => openViewer(0)} />
              <GridTile uri={sources[2].uri} onPress={() => openViewer(2)} />
            </View>
            <View style={[Atoms.flex_1, Atoms.flex_col, { gap: GRID_GAP }]}>
              <GridTile uri={sources[1].uri} onPress={() => openViewer(1)} />
              <GridTile uri={sources[3].uri} onPress={() => openViewer(3)} />
            </View>
          </>
        )}
      </View>
      {viewer}
    </>
  );
}

function GridTile({ uri, onPress }: { uri: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={(e) => {
        // Stop the outer post-card press from also firing.
        e.stopPropagation?.();
        onPress();
      }}
      style={Atoms.flex_1}
    >
      <Image
        source={{ uri }}
        resizeMode="cover"
        style={[Atoms.w_full, Atoms.h_full, { backgroundColor: TILE_BG }]}
      />
    </Pressable>
  );
}
