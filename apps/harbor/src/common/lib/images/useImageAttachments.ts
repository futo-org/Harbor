import { IMAGE_PICKER_DEFAULT_OPTIONS } from '@/src/common/lib/images/loadBoundedImage';
import { processAndUploadImage } from '@/src/common/lib/images/processAndUploadImage';
import {
  ImageImportError,
  formatImageImportErrorOrFallback,
} from '@/src/common/lib/images/ImageImportError';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import type { v2 } from '@polycentric/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef } from 'react';
import { Keyboard } from 'react-native';

export const MAX_ATTACHMENTS = 4;

/** Longest edge lengths for image variants. */
const IMAGE_VARIANT_SIZES = [512, 1280];

const IMAGE_OPTIONS = {
  mode: 'fit',
  sizes: IMAGE_VARIANT_SIZES,
} as const;

/**
 * `processing` — being resized/uploaded; `ready` — blobs are on the server;
 * `error` — processing failed (submit will retry from scratch).
 */
export type ImageAttachmentStatus = 'processing' | 'ready' | 'error';

export type ImageAttachment = {
  id: string;
  uri: string;
  width: number;
  height: number;
  status: ImageAttachmentStatus;
};

export type UseImageAttachmentsArgs = {
  // A getter, so attaching right after a reset sees the emptied list.
  getAttachments: () => ImageAttachment[];
  addAttachments: (additions: ImageAttachment[]) => void;
  setAttachmentStatus: (id: string, status: ImageAttachmentStatus) => void;
  removeAttachment: (id: string) => void;
  /** Blocks attaching and removing, e.g. while submitting. */
  disabled: boolean;
  /** Shows (or clears, with null) an attachment error in the host form. */
  setError: (error: string | null) => void;
};

/**
 * Image attachments for a form: picking, capturing, removing, and uploading
 * each image as soon as it's attached. The caller owns the attachments state.
 */
export function useImageAttachments({
  getAttachments,
  addAttachments,
  setAttachmentStatus,
  removeAttachment,
  disabled,
  setError,
}: UseImageAttachmentsArgs) {
  const client = usePolycentric();

  // In-flight (or completed) image processing+upload promises, keyed by
  // attachment id. We start the work as soon as an image is attached so the
  // blobs are usually on the server by the time the user submits;
  // `resolveImageSets` then just awaits these instead of starting from scratch.
  const uploadCacheRef = useRef(new Map<string, Promise<v2.ImageSet>>());

  const attachDisabled = disabled || getAttachments().length >= MAX_ATTACHMENTS;

  // Begin processing + uploading an attachment immediately, caching the
  // promise by id so `resolveImageSets` can await the already-running work (it
  // waits here if the user submits before processing finishes). The
  // attachment's `status` drives the thumbnail's loading/error overlay.
  const startUpload = useCallback(
    (id: string, uri: string) => {
      const uploadCache = uploadCacheRef.current;
      const work = processAndUploadImage(client, uri, IMAGE_OPTIONS);
      uploadCache.set(id, work);
      work.then(
        () => setAttachmentStatus(id, 'ready'),
        (err) => {
          // Drop the failed promise so the submit path can retry from scratch.
          uploadCache.delete(id);
          if (err instanceof ImageImportError && err.stage === 'upload') {
            // A failed upload may be transient: keep the attachment, flag the
            // thumbnail, and let `resolveImageSets` retry it. Rarely reached:
            // the client's `uploadBlob` swallows server errors and the blob is
            // re-sent on the next sync.
            setAttachmentStatus(id, 'error');
          } else {
            // The image can't be processed or saved locally: drop it and say
            // why.
            removeAttachment(id);
            setError(
              formatImageImportErrorOrFallback(
                err,
                "Couldn't attach this image.",
              ),
            );
          }
        },
      );
    },
    [client, setAttachmentStatus, removeAttachment, setError],
  );

  // Turn picked/captured/shared assets into attachments: show the thumbnails
  const ingestAssets = useCallback(
    (assets: { uri: string; width: number; height: number }[]) => {
      const numAttachments = MAX_ATTACHMENTS - getAttachments().length;
      if (numAttachments <= 0) return;
      // Picking again clears any prior error (permission, failed upload).
      setError(null);
      const additions = assets.slice(0, numAttachments).map((asset, i) => ({
        id: `${Date.now()}-${i}-${asset.uri}`,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        status: 'processing' as const,
      }));
      addAttachments(additions);
      additions.forEach((a) => {
        startUpload(a.id, a.uri);
      });
    },
    [getAttachments, addAttachments, startUpload, setError],
  );

  // Pick existing photo(s) from the media library.
  const handleAttachImage = useCallback(async () => {
    if (attachDisabled) return;
    // Dismiss the keyboard first so TrueSheet resets its footer keyboard
    // offset; otherwise the footer keeps the keyboard gap after the picker
    // closes (the keyboard is gone, but the inset/offset lingers).
    Keyboard.dismiss();
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS - getAttachments().length,
      ...IMAGE_PICKER_DEFAULT_OPTIONS,
    });
    if (result.canceled || !result.assets?.length) return;
    ingestAssets(result.assets);
  }, [attachDisabled, getAttachments, ingestAssets]);

  // Capture a new photo with the camera (mobile only).
  const handleCaptureImage = useCallback(async () => {
    if (attachDisabled) return;
    Keyboard.dismiss();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync();
    if (result.canceled || !result.assets?.length) return;
    ingestAssets(result.assets);
  }, [attachDisabled, ingestAssets, setError]);

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      removeAttachment(id);
      uploadCacheRef.current.delete(id);
      setError(null);
    },
    [removeAttachment, setError],
  );

  // Attachments started processing/uploading when they were added, so every
  // blob body is usually already on the server. Await those cached promises;
  // fall back to a fresh run if one is missing or previously failed (the catch
  // in `startUpload` evicts failures).
  const resolveImageSets = useCallback(
    (): Promise<v2.ImageSet[]> =>
      Promise.all(
        getAttachments().map(
          (a) =>
            uploadCacheRef.current.get(a.id) ??
            processAndUploadImage(client, a.uri, IMAGE_OPTIONS),
        ),
      ),
    [getAttachments, client],
  );

  return {
    attachDisabled,
    ingestAssets,
    handleAttachImage,
    handleCaptureImage,
    handleRemoveAttachment,
    resolveImageSets,
  };
}
