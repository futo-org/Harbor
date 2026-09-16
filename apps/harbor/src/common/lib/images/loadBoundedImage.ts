import { isWeb } from '@/src/common/util/platform';
import { Image, type ImageRef } from 'expo-image';
import {
  type ImagePickerOptions,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';

/**
 * Longest edge the source is decoded at. Variants are cut from this bounded
 * bitmap, so a 300 MP photo never becomes a ~1.2 GB decode (iOS jetsam,
 * Android OOM) or a canvas past the browser's size limit (blank output).
 */
const BOUNDED_MAX_EDGE = 2048;

/**
 * Options every `launchImageLibraryAsync` call must include. iOS then hands
 * over an 8-bit representation; a 10-bit HEIC would fail in `processAndUploadImage`.
 */
export const IMAGE_PICKER_DEFAULT_OPTIONS = {
  preferredAssetRepresentationMode:
    UIImagePickerPreferredAssetRepresentationMode.Compatible,
} satisfies ImagePickerOptions;

/**
 * Decode `uri` into an upright bitmap whose longest edge is at most
 * `BOUNDED_MAX_EDGE`. This is the only step that touches the original file.
 * The returned ref is a valid `ImageManipulator.manipulate` source on every
 * platform.
 */
export async function loadBoundedImage(uri: string): Promise<ImageRef> {
  if (isWeb) {
    // expo-image's web `loadAsync` ignores `maxWidth`/`maxHeight`, so the
    // bounding happens in `downscaleInBrowser` and the small PNG is handed
    // over as an object URL. Formats the browser can't decode (HEIC) reject
    // there with a real Error instead of the manipulator's bare `<canvas>`.
    const boundedUri = await downscaleInBrowser(uri);

    try {
      // The web ref copies the blob behind its own URL, so this one can go.
      return await Image.loadAsync(boundedUri);
    } finally {
      URL.revokeObjectURL(boundedUri);
    }
  }

  // expo-image downsamples while decoding (ImageIO thumbnail on iOS, Glide
  // on Android).
  return Image.loadAsync(uri, {
    maxWidth: BOUNDED_MAX_EDGE,
    maxHeight: BOUNDED_MAX_EDGE,
  });
}

/**
 * Decode to a bitmap no larger than `BOUNDED_MAX_EDGE` through
 * `createImageBitmap`'s resize options, draw it to a small canvas, and return
 * a PNG object URL. The guarantee is that no canvas ever exceeds the browser's
 * size limit, which is what produced the blank variants. Whether the full-size
 * pixels are ever materialised depends on the codec: Chromium decodes JPEG
 * straight to the reduced size, while PNG is always decoded in full and then
 * scaled.
 */
async function downscaleInBrowser(uri: string): Promise<string> {
  const [blob, { width, height }] = await Promise.all([
    fetch(uri).then((response) => response.blob()),
    readImageDimensions(uri),
  ]);

  const bitmap = await createImageBitmap(blob, {
    // Bake EXIF orientation in, like `<img>` does, so the bitmap matches the
    // dimensions read above. Explicit because older Safari/Firefox defaulted
    // to `none`.
    imageOrientation: 'from-image',
    resizeQuality: 'high',
    ...(width >= height
      ? { resizeWidth: Math.min(BOUNDED_MAX_EDGE, width) }
      : { resizeHeight: Math.min(BOUNDED_MAX_EDGE, height) }),
  });

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a 2d canvas context');

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );

  if (!png) throw new Error('Could not encode the downscaled image');

  return URL.createObjectURL(png);
}

/** Read the intrinsic size through an `<img>`; browsers take it from the header. */
function readImageDimensions(
  uri: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');

    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () =>
      reject(new Error('The browser cannot decode this image'));

    image.src = uri;
  });
}
