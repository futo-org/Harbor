import { pickImageVariant } from '@/src/common/lib/polycentric-hooks/helpers';
import { v2 } from '@polycentric/react-native';
import { ImageViewerInput, ImageViewerSource } from './useImageViewerStore';

/** Pull the largest available variant for the viewer. */
export const VIEWER_TARGET = 2048;

type BlobDigest = NonNullable<NonNullable<v2.Image['blob']>['digest']>;

/**
 * Resolve the image source from an array of mixed inputs
 */
export function resolveImageSources(
  images: ImageViewerInput[],
  blobUrl: (digest: BlobDigest) => string | null,
): ImageViewerSource[] {
  return images
    .map((image) => {
      if ('uri' in image) {
        return image;
      }
      const variant = pickImageVariant(image, VIEWER_TARGET);
      const digest = variant?.blob?.digest;
      if (!digest) return null;
      const uri = blobUrl(digest);
      if (!uri) return null;
      const w = variant.width || 1;
      const h = variant.height || 1;
      return { uri, aspectRatio: w / h };
    })
    .filter((s): s is ImageViewerSource => s != null);
}
