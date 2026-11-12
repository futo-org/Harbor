import { toast } from '@/src/common/components/toast';
import { isAndroid } from '@/src/common/util/platform';
import { MAX_ATTACHMENTS } from '@/src/features/composer/hooks/useComposer';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import {
  clearSharedPayloads,
  getSharedPayloads,
  type SharePayload,
} from 'expo-sharing';
import { joinSharedText } from './joinSharedText';
import {
  type PendingShareImage,
  usePendingShareStore,
} from './usePendingShareStore';

// Longest edge decoded to read an image's dimensions; only the aspect ratio
// is used, so a small decode is enough.
const DIMENSIONS_DECODE_MAX_EDGE = 256;

/**
 * Take what was shared into the app from the share sheet into
 * `usePendingShareStore`. Called when expo-sharing's URL opens the app.
 */
export async function takeIncomingShare() {
  const payloads = getSharedPayloads();
  if (payloads.length === 0) return;

  // The payload is read once: a share that isn't taken now is never taken
  clearSharedPayloads();

  const imagePayloads = payloads.filter(
    (payload) => payload.shareType === 'image',
  );

  // Android can't cap the image count in the share sheet, iOS can
  if (imagePayloads.length > MAX_ATTACHMENTS) {
    toast.info(`Only the first ${MAX_ATTACHMENTS} images were added`);
  }

  const importResults = await Promise.allSettled(
    imagePayloads
      .slice(0, MAX_ATTACHMENTS)
      .map((payload, index) => importSharedImage(payload.value, index)),
  );

  const images: PendingShareImage[] = [];

  for (const result of importResults) {
    if (result.status === 'fulfilled') {
      images.push(result.value);
    } else {
      console.warn('shared image import failed:', result.reason);
    }
  }

  const failedImageCount = importResults.length - images.length;
  if (failedImageCount > 0) {
    toast.error(
      failedImageCount === 1
        ? "Couldn't add a shared image"
        : `Couldn't add ${failedImageCount} shared images`,
    );
  }

  usePendingShareStore
    .getState()
    .setPendingShare({ text: buildSharedText(payloads), images });
}

function buildSharedText(payloads: SharePayload[]): string {
  return joinSharedText(
    payloads
      .filter((payload) => payload.shareType === 'text')
      .map((payload) => payload.value),
    payloads
      .filter((payload) => payload.shareType === 'url')
      .map((payload) => payload.value),
  );
}

/** Bring a shared image into the app cache and read its dimensions. */
async function importSharedImage(
  sourceUri: string,
  index: number,
): Promise<PendingShareImage> {
  const directory = new Directory(Paths.cache, 'shared-images');
  directory.create({ intermediates: true, idempotent: true });

  const source = new File(sourceUri);
  // Unique per share: the shared files' own names can repeat across shares
  const target = new File(
    directory,
    `${Date.now()}-${index}${source.extension}`,
  );

  // Android: read access to the sender's content:// URI is temporary.
  // iOS: expo-sharing never deletes its copy in the App Group container.
  if (isAndroid) {
    await source.copy(target);
  } else {
    await source.move(target);
  }

  const decoded = await Image.loadAsync(target.uri, {
    maxWidth: DIMENSIONS_DECODE_MAX_EDGE,
    maxHeight: DIMENSIONS_DECODE_MAX_EDGE,
  });

  const { width, height } = decoded;

  decoded.release();

  return { uri: target.uri, width, height };
}
