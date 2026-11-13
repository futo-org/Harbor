import type { TranscodeLimits } from '@polycentric/video-transcoding';

/**
 * Harbor's limits for animated image attachments, passed to `transcode`.
 *
 * TODO: we need to make sure these limits are reflected in server validation before accepting video
 * blobs.
 */
export const ANIMATED_IMAGE_LIMITS: TranscodeLimits = {
  maxSourceBytes: 50_000_000,
  maxSourcePixels: 16_000_000,
  maxOutputFrames: 200,
  maxOutputPixels: 1_000_000,
  maxOutputBytes: 5_000_000,
  maxFps: 30,
};
