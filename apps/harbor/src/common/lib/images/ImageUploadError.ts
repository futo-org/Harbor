export type ImageUploadStage = 'decode' | 'encode' | 'upload';

/**
 * The only error `processAndUploadImage` rejects with. `cause` carries the
 * library's raw error (often not even an `Error`) for logs.
 */
export class ImageUploadError extends Error {
  constructor(
    readonly stage: ImageUploadStage,
    cause: unknown,
  ) {
    super(`Image ${stage} failed`, { cause });
    this.name = 'ImageUploadError';
  }
}

const IMAGE_UPLOAD_ERROR_MESSAGE_BY_STAGE: Record<ImageUploadStage, string> = {
  decode: "Couldn't open this image. Try a different format.",
  encode: "Couldn't process this image. Try a different photo.",
  upload: "Couldn't upload this image. Check your connection and try again.",
};

/** User-facing copy for an `ImageUploadError`; anything else gets `fallback`. */
export function formatImageUploadErrorOrFallback(
  error: unknown,
  fallback: string,
): string {
  return error instanceof ImageUploadError
    ? IMAGE_UPLOAD_ERROR_MESSAGE_BY_STAGE[error.stage]
    : fallback;
}
