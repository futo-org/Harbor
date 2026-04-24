import { sha256 } from '@noble/hashes/sha2';
import { v2, type PolycentricClient } from '@polycentric/react-native';

/** Default variant edge lengths. */
export const DEFAULT_IMAGE_VARIANT_SIZES = [48, 128, 512];

export type ProcessAndUploadOptions = {
  /** Variant edge lengths to emit. Interpreted per `mode`. */
  sizes?: number[];
  /** `fill` crops to a square (default, for avatars). `fit` preserves aspect. */
  mode?: 'fill' | 'fit';
  /** Source image width. Required for `mode: 'fit'` so variants record correct dims. */
  sourceWidth?: number;
  /** Source image height. Required for `mode: 'fit'` so variants record correct dims. */
  sourceHeight?: number;
};

/**
 * Fetch an image from `uri`, resize it into each size in `sizes` via
 * the core's JPEG encoder, upload each variant's bytes to the client's
 * servers, and return the assembled `ImageSet`.
 */
export async function processAndUploadImage(
  client: PolycentricClient,
  uri: string,
  options: ProcessAndUploadOptions = {},
): Promise<v2.ImageSet> {
  const sizes = options.sizes ?? DEFAULT_IMAGE_VARIANT_SIZES;
  const mode = options.mode ?? 'fill';

  const response = await fetch(uri);
  const raw = new Uint8Array(await response.arrayBuffer());

  const variants = await Promise.all(
    sizes.map(async (size) => {
      const jpeg = client.processImageToJpeg(raw, size, size, mode);
      const { width, height } = computeOutputDims(
        size,
        size,
        mode,
        options.sourceWidth,
        options.sourceHeight,
      );
      const image = v2.Image.create({
        blob: {
          digest: {
            type: v2.ContentDigestType.SHA256,
            value: sha256(jpeg),
          },
          mimeType: 'image/jpeg',
          size: BigInt(jpeg.length),
        },
        width,
        height,
      });
      return { image, body: jpeg };
    }),
  );

  await Promise.all(
    variants.map((v) =>
      v.image.blob
        ? client.uploadBlob(v.image.blob, v.body)
        : Promise.resolve(),
    ),
  );

  return v2.ImageSet.create({ images: variants.map((v) => v.image) });
}

/**
 * Match the `image` crate's `resize()`: scale both axes by
 * `min(targetW/srcW, targetH/srcH)` and round. For fill mode the
 * output is always exactly the requested bounds. For fit mode without
 * known source dims, we fall back to the bounds (the client can re-
 * derive aspect from the served image if needed).
 */
function computeOutputDims(
  targetW: number,
  targetH: number,
  mode: 'fill' | 'fit',
  srcW?: number,
  srcH?: number,
): { width: number; height: number } {
  if (mode === 'fill' || !srcW || !srcH) {
    return { width: targetW, height: targetH };
  }
  const ratio = Math.min(targetW / srcW, targetH / srcH);
  return {
    width: Math.max(1, Math.round(srcW * ratio)),
    height: Math.max(1, Math.round(srcH * ratio)),
  };
}
