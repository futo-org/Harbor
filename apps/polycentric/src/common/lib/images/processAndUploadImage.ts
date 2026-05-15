import { v2, type PolycentricClient } from '@polycentric/react-native';
import { File } from 'expo-file-system';
import { isWeb } from '@/src/common/util/platform';

/** Default variant edge lengths. */
export const DEFAULT_IMAGE_VARIANT_SIZES = [48, 128, 512];

export type ProcessAndUploadOptions = {
  /** Variant edge lengths to emit. Interpreted per `mode`. */
  sizes?: number[];
  /** `fill` crops to a square (default, for avatars). `fit` preserves aspect. */
  mode?: 'fill' | 'fit';
};

/**
 * Fetch an image from `uri`, resize it into each size in `sizes` via
 * the core's JPEG encoder, commit each variant locally and upload to
 * the client's servers, and return the assembled `ImageSet`.
 */
export async function processAndUploadImage(
  client: PolycentricClient,
  uri: string,
  options: ProcessAndUploadOptions = {},
): Promise<v2.ImageSet> {
  const sizes = options.sizes ?? DEFAULT_IMAGE_VARIANT_SIZES;
  const mode = options.mode ?? 'fill';

  // RN's `fetch` can't read `file://` URIs on Android (and is
  // unreliable on iOS), so go through `expo-file-system` on
  // native. Web stays on `fetch` to handle `blob:` / `data:` URIs
  // from `<input type="file">`.
  const buffer = isWeb
    ? await (await fetch(uri)).arrayBuffer()
    : await new File(uri).arrayBuffer();
  const raw = new Uint8Array(buffer);

  const variants = await Promise.all(
    sizes.map(async (size) => {
      const { bytes, width, height } = client.processImageToJpeg(
        raw,
        size,
        size,
        mode,
      );
      const blob = await client.commitBlob(bytes, 'image/jpeg');
      return { image: v2.Image.create({ blob, width, height }), body: bytes };
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
