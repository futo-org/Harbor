export type ImageUploadStage = 'decode' | 'encode' | 'upload';

/**
 * The only error `processAndUploadImage` should reject with. `stage` says which step
 * failed; the library's own error (developer text, sometimes not even an
 * `Error`) rides along as `cause` for logs.
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

/**
 * User-facing copy for a failure that may have come from the image pipeline.
 * Anything else gets `fallback`; library messages never reach the screen.
 */
export function formatImageUploadErrorOrFallback(
  error: unknown,
  fallback: string,
): string {
  return error instanceof ImageUploadError
    ? IMAGE_UPLOAD_ERROR_MESSAGE_BY_STAGE[error.stage]
    : fallback;
}
