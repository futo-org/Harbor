import { createTranscoder } from './src/transcode';
import { webBackend } from './src/web/webBackend';

export { TranscodeError, type TranscodeErrorCode } from './src/errors';
export {
  DEFAULT_TRANSCODE_LIMITS,
  type TranscodeLimits,
} from './src/limits';
export type { TranscodeOptions, TranscodeResult } from './src/types';

/** Transcode an animated GIF to H.264 MP4, and also return a thumbnail. */
export const transcode = createTranscoder(webBackend);
