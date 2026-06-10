/**
 * Pure layout math for composer attachment previews. Kept separate from the
 * component so it can be unit-tested without rendering.
 */

/** Fallback aspect ratio when an attachment's dimensions are unknown. */
export const DEFAULT_ASPECT_RATIO = 16 / 9;
/** Clamp the single-image preview so tall/wide images don't dominate. */
export const MIN_ASPECT_RATIO = 3 / 4;
export const MAX_ASPECT_RATIO = 16 / 9;

/**
 * Aspect ratio for the full-width single-image preview: the image's natural
 * ratio, clamped to a sane range (falls back to 16:9 if dimensions are absent).
 */
export function singleImageAspectRatio(dims: {
  width?: number;
  height?: number;
}): number {
  if (!dims.width || !dims.height) return DEFAULT_ASPECT_RATIO;
  const ratio = dims.width / dims.height;
  return Math.min(Math.max(ratio, MIN_ASPECT_RATIO), MAX_ASPECT_RATIO);
}
