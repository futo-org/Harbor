export type ImageImportStage = 'decode' | 'encode' | 'persist' | 'upload';

/**
 * The only error the image import functions reject with. `cause` carries the
 * library's raw error (often not even an `Error`) for logs.
 */
export class ImageImportError extends Error {
  constructor(
    readonly stage: ImageImportStage,
    cause: unknown,
  ) {
    super(`Image ${stage} failed`, { cause });
    this.name = 'ImageImportError';
  }
}

const IMAGE_IMPORT_ERROR_MESSAGE_BY_STAGE: Record<ImageImportStage, string> = {
  decode: "Couldn't open this image. Try a different format.",
  encode: "Couldn't process this image. Try a different photo.",
  persist:
    "Couldn't save this image to your device. Check your available storage.",
  upload: "Couldn't upload this image. Check your connection and try again.",
};

/** User-facing copy for an `ImageImportError`; anything else gets `fallback`. */
export function formatImageImportErrorOrFallback(
  error: unknown,
  fallback: string,
): string {
  return error instanceof ImageImportError
    ? IMAGE_IMPORT_ERROR_MESSAGE_BY_STAGE[error.stage]
    : fallback;
}
