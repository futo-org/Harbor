import { v2, type PolycentricClient } from '@polycentric/react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { loadBoundedImage, type DecodedImageRef } from './loadBoundedImage';
import { isWeb } from '@/src/common/util/platform';
import { File } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { ImageImportError, type ImageImportStage } from './ImageImportError';

/** Default variant edge lengths. */
export const DEFAULT_IMAGE_VARIANT_SIZES = [48, 128, 512];

/**
 * Longest edge the source is decoded at, so a huge photo never becomes a
 * multi-GB decode (iOS jetsam, Android OOM) or an oversized canvas (blank
 * output on web). Every variant size must fit inside it.
 */
const SOURCE_DECODE_MAX_EDGE = 2048;

/** JPEG quality for the encoded variants (0–1). */
const JPEG_COMPRESS = 0.8;

export type ImageEncodingOptions = {
  /** Variant edge lengths to emit. Interpreted per `mode`. */
  sizes?: number[];
  /** `fill` crops to a square (default, for avatars). `fit` preserves aspect. */
  mode?: 'fill' | 'fit';
};

export type ProcessAndUploadOptions = ImageEncodingOptions;

/** The raw bytes and metadata of an encoded image variant. */
export type ImageVariant = {
  meta: v2.Image & { blob: v2.Blob };
  bytes: Uint8Array;
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
 * Decode an image from `uri` and resize it into each size in `sizes` via
 * `expo-image-manipulator`, without persisting or uploading anything. Runtime
 * failures reject with `ImageImportError`; a variant size above
 * `SOURCE_DECODE_MAX_EDGE` is a programming error and throws before any work
 * starts.
 */
export async function encodeImageVariants(
  uri: string,
  options: ImageEncodingOptions = {},
): Promise<ImageVariant[]> {
  const sizes = options.sizes ?? DEFAULT_IMAGE_VARIANT_SIZES;
  const mode = options.mode ?? 'fill';

  if (Math.max(...sizes) > SOURCE_DECODE_MAX_EDGE) {
    throw new Error(
      `Variant sizes must be at most ${SOURCE_DECODE_MAX_EDGE}px, got ${sizes.join(', ')}`,
    );
  }

  const source = await runStage('decode', () =>
    loadBoundedImage(uri, SOURCE_DECODE_MAX_EDGE),
  );

  return runStage('encode', () =>
    Promise.all(
      sizes.map(async (size) => {
        const { bytes, width, height } = await encodeVariant(
          source,
          size,
          mode,
        );

        const blob = v2.Blob.create({
          digest: { type: v2.ContentDigestType.SHA256, value: sha256(bytes) },
          mimeType: 'image/jpeg',
          size: BigInt(bytes.length),
        });

        return { meta: { ...v2.Image.create({ width, height }), blob }, bytes };
      }),
    ),
  );
}

/**
 * Encode an image from `uri` into variants (see `encodeImageVariants`), commit
 * every variant locally, then upload them all to the client's servers, and
 * return the assembled `ImageSet`. Runtime failures reject with
 * `ImageImportError` tagged with the failing stage.
 */
export async function processAndUploadImage(
  client: PolycentricClient,
  uri: string,
  options: ProcessAndUploadOptions = {},
): Promise<v2.ImageSet> {
  const variants = await encodeImageVariants(uri, options);

  // TODO: We shouldn't recompute the hash in `commitBlob()`.
  await runStage('persist', () =>
    Promise.all(
      variants.map(({ meta, bytes }) =>
        client.commitBlob(bytes, meta.blob.mimeType),
      ),
    ),
  );

  await runStage('upload', () =>
    Promise.all(
      variants.map(({ meta, bytes }) => client.uploadBlob(meta.blob, bytes)),
    ),
  );

  return v2.ImageSet.create({ images: variants.map(({ meta }) => meta) });
}

/** Log whatever the step throws and re-throw it tagged with the stage. */
async function runStage<T>(
  stage: ImageImportStage,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    console.error(`image processing ${stage} failed`, cause);
    throw new ImageImportError(stage, cause);
  }
}

/**
 * Produce a single JPEG variant from the decoded `source`. `fill` center-crops
 * to a square then scales to `size`×`size`; `fit` scales the longest edge down
 * to `size` while preserving aspect ratio (never upscaling).
 */
async function encodeVariant(
  source: DecodedImageRef,
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
