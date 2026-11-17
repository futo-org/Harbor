/**
 * Size and processing constraints for a transcode operation.
 */
export type TranscodeLimits = {
  /** Limits the input source file size, checked before reading the file. */
  maxSourceBytes: number;
  /**
   * Limits the number of pixels in any given frame of the input video, which is a function of the
   * video's resolution. Bounds memory overhead of transcoding.
   */
  maxSourcePixels: number;
  /**
   * Limits the number of frames in the input, checked while reading file headers. Bounds the memory
   * overhead of reading a file.
   */
  maxSourceFrames: number;
  /** Limits the number of frames in the output video, after adusting for `maxFps`. */
  maxOutputFrames: number;
  /** Limits the nuumber of pixels in any given frame of the output video. */
  maxOutputPixels: number;
  /** Limits output file size. Tries with a lower bit-rate if the limit is exceeded. */
  maxOutputBytes: number;
  /** Output frame rate cap. Will merge frames until the target frame rate has been reached. */
  maxFps: number;
};

export const DEFAULT_TRANSCODE_LIMITS: Readonly<TranscodeLimits> = {
  maxSourceBytes: 50_000_000, // 50MB input file size
  maxSourcePixels: 4_000_000, // fits 2560 x 1440 resolution or equivalent
  maxSourceFrames: 500, // Extra headroom for GIFs whose frames get merged
  maxOutputFrames: 200, // Fits most social media GIFs
  maxOutputPixels: 1_000_000, // outputs 1280 x 720 resolution or equivalent
  maxOutputBytes: 5_000_000, // 5MB output file size
  maxFps: 30,
};

export type TranscodeErrorCode =
  /** Source file exceeds `limits.maxSourceBytes` */
  | 'source-too-large'
  /** Frame resolution exceeds `limits.maxSourcePixels` */
  | 'source-canvas-too-large'
  /** Frame count in the source exceeds `limits.maxSourceFrames` */
  | 'source-too-many-frames'
  /** Frame count in video output exceeds `limits.maxOutputFrames` */
  | 'too-many-frames'
  /** The video output is over `limits.maxOutputBytes`, even after trying a lower bitrate */
  | 'output-too-large'
  /** No usable H.264 encoder (such as a browser without WebCodecs H.264) */
  | 'unsupported'
  | 'decode-failed'
  | 'encode-failed';

export class TranscodeError extends Error {
  readonly code: TranscodeErrorCode;

  constructor(
    code: TranscodeErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'TranscodeError';
    this.code = code;
  }
}

/**
 * Selects an equal-aspect-ratio resolution that fits within `maxOutputSize` limits.
 */
export function calcOutputResolution(
  _canvasWidth: number,
  _canvasHeight: number,
  _maxOutputPixels: number,
): { width: number; height: number } {
  throw new Error('calcOutputResolution: not implemented');
}

/** Select a bitrate that stays under `maxOutputBytes` limits for most videos at `maxFps`. */
export function calcBitrate(
  _width: number,
  _height: number,
  _fps: number,
): number {
  throw new Error('calcBitrate: not implemented');
}
