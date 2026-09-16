import { v2, type PolycentricClient } from '@polycentric/react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImageRef } from 'expo-image';
import { loadBoundedImage } from './helpers';
import { isWeb } from '@/src/common/util/platform';
import { File } from 'expo-file-system';
import { ImageUploadError, type ImageUploadStage } from './ImageUploadError';

/** Default variant edge lengths. */
export const DEFAULT_IMAGE_VARIANT_SIZES = [48, 128, 512];

/** JPEG quality for the encoded variants (0–1). */
const JPEG_COMPRESS = 0.8;

export type ProcessAndUploadOptions = {
  /** Variant edge lengths to emit. Interpreted per `mode`. */
  sizes?: number[];
  /** `fill` crops to a square (default, for avatars). `fit` preserves aspect. */
  mode?: 'fill' | 'fit';
};

/** Read a local/remote image URI into raw bytes. */
async function readBytes(uri: string): Promise<Uint8Array> {
  // RN's `fetch` can't read `file://` URIs on Android (and is unreliable on
  // iOS), so go through `expo-file-system` on native. Web stays on `fetch` to
  // handle `blob:` / `data:` URIs from `<input type="file">`.
  const buffer = isWeb
    ? await (await fetch(uri)).arrayBuffer()
    : await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Decode an image from `uri`, resize it into each size in `sizes` via
 * `expo-image-manipulator`, commit each variant locally and upload to the
 * client's servers, and return the assembled `ImageSet`. Rejects only with
 * `ImageUploadError`.
 */
export async function processAndUploadImage(
  client: PolycentricClient,
  uri: string,
  options: ProcessAndUploadOptions = {},
): Promise<v2.ImageSet> {
  const sizes = options.sizes ?? DEFAULT_IMAGE_VARIANT_SIZES;
  const mode = options.mode ?? 'fill';

  // Decode once, bounded, with EXIF orientation baked into upright pixels.
  // The result is the source for every variant so we don't re-decode per size.
  const source = await runStage('decode', () => loadBoundedImage(uri));

  const variants = await runStage('encode', () =>
    Promise.all(sizes.map((size) => encodeVariant(source, size, mode))),
  );

  return runStage('upload', async () => {
    const images = await Promise.all(
      variants.map(async ({ bytes, width, height }) => {
        const blob = await client.commitBlob(bytes, 'image/jpeg');
        if (blob) await client.uploadBlob(blob, bytes);
        return v2.Image.create({ blob, width, height });
      }),
    );
    return v2.ImageSet.create({ images });
  });
}

/**
 * Run one pipeline step. Whatever it throws (Glide dumps, object URLs, a bare
 * `<canvas>` on web) is logged and re-thrown tagged with the stage.
 */
async function runStage<T>(
  stage: ImageUploadStage,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    console.error(`processAndUploadImage: ${stage} failed`, cause);
    throw new ImageUploadError(stage, cause);
  }
}

/**
 * Produce a single JPEG variant from the decoded `source`. `fill` center-crops
 * to a square then scales to `size`×`size`; `fit` scales the longest edge down
 * to `size` while preserving aspect ratio (never upscaling).
 */
async function encodeVariant(
  source: ImageRef,
  size: number,
  mode: 'fill' | 'fit',
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { width: srcWidth, height: srcHeight } = source;
  const context = ImageManipulator.manipulate(source);

  if (mode === 'fill') {
    const edge = Math.min(srcWidth, srcHeight);
    context.crop({
      originX: (srcWidth - edge) / 2,
      originY: (srcHeight - edge) / 2,
      width: edge,
      height: edge,
    });
    context.resize({ width: size, height: size });
  } else if (srcWidth >= srcHeight) {
    context.resize({ width: Math.min(size, srcWidth) });
  } else {
    context.resize({ height: Math.min(size, srcHeight) });
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_COMPRESS,
  });
  return {
    bytes: await readBytes(saved.uri),
    width: saved.width,
    height: saved.height,
  };
}
