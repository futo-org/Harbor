import { isWeb } from '@/src/common/util/platform';
import { ImageManipulator } from 'expo-image-manipulator';
import { Image } from 'expo-image';

/**
 * Longest edge the source is decoded at. Variants are cut from this bounded
 * bitmap, so a 300 MP photo never becomes a ~1.2 GB decode (iOS jetsam,
 * Android OOM) or a canvas past the browser's size limit (blank output).
 */
const BOUNDED_MAX_EDGE = 2048;

/** A decoded image the manipulator accepts as a source, plus its dimensions. */
export type DecodedImage = Exclude<
  Parameters<typeof ImageManipulator.manipulate>[0],
  string
> & { width: number; height: number };

/**
 * Decode `uri` into an upright bitmap whose longest edge is at most
 * `BOUNDED_MAX_EDGE`. This is the only step that touches the original file.
 */
export async function loadBoundedImage(uri: string): Promise<DecodedImage> {
  if (isWeb) {
    // The web manipulator only takes a URI, so the bounded bitmap is handed over
    // as an object URL. Formats the browser can't decode (HEIC) reject here with
    // a real Error instead of the manipulator's bare `err: <canvas>`.
    const boundedUri = await downscaleInBrowser(uri);

    try {
      return await ImageManipulator.manipulate(boundedUri).renderAsync();
    } finally {
      URL.revokeObjectURL(boundedUri);
    }
  }

  // expo-image downsamples while decoding (ImageIO thumbnail on iOS, Glide
  // on Android). The picker must hand over 8-bit assets (see
  // `preferredAssetRepresentationMode` at the call sites): a 10-bit HEIC ref
  // hangs the manipulator's orientation fixer instead of rejecting.
  return Image.loadAsync(uri, {
    maxWidth: BOUNDED_MAX_EDGE,
    maxHeight: BOUNDED_MAX_EDGE,
  });
}

/**
 * Decode straight to a bitmap no larger than `BOUNDED_MAX_EDGE` through
 * `createImageBitmap`'s resize options (the browser never materialises the
 * full-size pixels), draw it to a small canvas, and return a PNG object URL.
 */
async function downscaleInBrowser(uri: string): Promise<string> {
  const [blob, { width, height }] = await Promise.all([
    fetch(uri).then((response) => response.blob()),
    readImageDimensions(uri),
  ]);

  const bitmap = await createImageBitmap(blob, {
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
