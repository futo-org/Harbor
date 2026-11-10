/**
 * Pure layout math for image previews, shared with `PostImages` so a preview
 * matches the posted result. Kept separate from the components so it can be
 * unit-tested without rendering.
 */

/** Fallback aspect ratio when an attachment's dimensions are unknown. */
export const DEFAULT_ASPECT_RATIO = 16 / 9;
/** Clamp so tall/wide images don't dominate. The minimum is a portrait phone
 *  screen; taller than that is letterboxed. */
export const MIN_ASPECT_RATIO = 9 / 16;
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
