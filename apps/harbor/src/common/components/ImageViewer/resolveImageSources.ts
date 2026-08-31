import { pickImageVariant } from '@/src/common/lib/polycentric-hooks/helpers';
import type { v2 } from '@polycentric/react-native';

export type ImageViewerInput =
  | v2.ImageSet
  | { uri: string; aspectRatio?: number };

/** Pull the largest available variant for the viewer. */
export const VIEWER_TARGET = 2048;

type BlobDigest = NonNullable<NonNullable<v2.Image['blob']>['digest']>;

/** A resolved source: candidate URLs (for fallback) plus aspect ratio. */
export type ResolvedImageSource = { uris: string[]; aspectRatio?: number };

/**
 * Resolve the image source from an array of mixed inputs. `target` picks
 * the variant size (defaults to the full-screen viewer's).
 */
export function resolveImageSources(
  images: ImageViewerInput[],
  blobUrls: (digest: BlobDigest) => string[],
  target: number = VIEWER_TARGET,
): ResolvedImageSource[] {
  return images
    .map((image): ResolvedImageSource | null => {
      if ('uri' in image) {
        return { uris: [image.uri], aspectRatio: image.aspectRatio };
      }
      const variant = pickImageVariant(image, target);
      const digest = variant?.blob?.digest;
      if (!digest) return null;
      const uris = blobUrls(digest);
      if (uris.length === 0) return null;
      const w = variant.width || 1;
      const h = variant.height || 1;
      return { uris, aspectRatio: w / h };
    })
    .filter((s): s is ResolvedImageSource => s != null);
}
