import { isAndroid, isWeb } from '@/src/common/util/platform';
import { Image, type ImageRef as ExpoImageRef } from 'expo-image';
import {
  ImageManipulator,
  type ImageRef as ManipulatorImageRef,
} from 'expo-image-manipulator';
import {
  type ImagePickerOptions,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';

/**
 * Pass to every `launchImageLibraryAsync` call: iOS then hands over 8-bit
 * pixels; 10-bit HEIC fails to decode in `processAndUploadImage`.
 */
export const IMAGE_PICKER_DEFAULT_OPTIONS = {
  preferredAssetRepresentationMode:
    UIImagePickerPreferredAssetRepresentationMode.Compatible,
} satisfies ImagePickerOptions;

/** A decoded image the manipulator accepts as a source, plus its dimensions. */
export type DecodedImageRef = ExpoImageRef | ManipulatorImageRef;

/**
 * Decode `uri` into an upright bitmap with longest edge at most `maxEdge`,
 * usable as an `ImageManipulator.manipulate` source on every platform.
 */
export async function loadBoundedImage(
  uri: string,
  maxEdge: number,
): Promise<DecodedImageRef> {
  if (isWeb) {
    // expo-image's web `loadAsync` ignores `maxWidth`/`maxHeight`.
    const boundedUri = await downscaleInBrowser(uri, maxEdge);

    try {
      // The ref copies the blob, so the URL can be revoked.
      return await Image.loadAsync(boundedUri);
    } finally {
      URL.revokeObjectURL(boundedUri);
    }
  }

  // Native `loadAsync` downsamples while decoding.
  const bounded = await Image.loadAsync(uri, {
    maxWidth: maxEdge,
    maxHeight: maxEdge,
  });

  // Android's manipulator rejects animated refs (a GifDrawable is not a
  // BitmapDrawable), so animated sources go through its own decode, which
  // yields the first frame. Unbounded, but animated files are small in practice.
  if (isAndroid && bounded.isAnimated) {
    return ImageManipulator.manipulate(uri).renderAsync();
  }

  return bounded;
}

/**
 * Decode through `createImageBitmap`'s resize options so no canvas exceeds the
 * browser's size limit (which produced blank variants); return a PNG object URL.
 */
async function downscaleInBrowser(
  uri: string,
  maxEdge: number,
): Promise<string> {
  const [blob, { width, height }] = await Promise.all([
    fetch(uri).then((response) => response.blob()),
    readImageDimensions(uri),
  ]);

  const bitmap = await createImageBitmap(blob, {
    // Match `<img>`'s EXIF handling so the bitmap agrees with the dimensions
    // read above; older Safari/Firefox defaulted to `none`.
    imageOrientation: 'from-image',
    resizeQuality: 'high',
    ...(width >= height
      ? { resizeWidth: Math.min(maxEdge, width) }
      : { resizeHeight: Math.min(maxEdge, height) }),
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
