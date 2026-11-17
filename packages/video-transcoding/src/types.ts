import type { TranscodeLimits } from './limits';

/**
 * `TranscodeBackend`s are an interface that implement both a "header pass" and an "encode pass" on
 * a specific platform target (iOS, Android, or web).
 *
 * The header pass reads headers to obtain estimates for the size of the transcode operation, in
 * terms of frames, resolution, memory overhead, etc. If these values exceed the limits placed on
 * the transcode operation, the operation will be cancelled before encoding begins.
 *
 * The encode pass then pulls frames from the source and streams each to the video encoding platform
 * implementation provided by the operating system or browser, one frame at a time. If the final
 * video output exceeds total size limits, the encode will be tried once more at a lower bitrate.
 * If the video still exceeds size limits, the output will be rejected.
 */
export type TranscodeBackend = {
  readHeader(uri: string, limits: SourceLimits): Promise<SourceHeader>;
  encode(request: EncodeRequest): Promise<EncodeResult>;
};

/** Pick of the limits enforced by the header pass. */
export type SourceLimits = Pick<
  TranscodeLimits,
  'maxSourceBytes' | 'maxSourceFrames'
>;

/** Frame size and timing, obtained from the source's video file headers. */
export type SourceFrameInfo = {
  left: number;
  top: number;
  width: number;
  height: number;
  delayMs: number;
};

/** Animated image/video info obtained from reading the source's file headers. */
export type SourceHeader = {
  byteSize: number;
  canvasWidth: number;
  canvasHeight: number;
  frames: SourceFrameInfo[];
};

/** A planned frame for placement in the output video, determined before encoding/decoding. */
export type ScheduledFrame = {
  sourceFrameIndex: number;
  timestampUs: number;
  durationUs: number;
};

/**
 * Specifies desired destination URI, resolution, bitrate, and frame rates for an output video. Note
 * that `bitrate` is target average bits/sec for variable bitrate encoding.
 */
export type EncodeRequest = {
  uri: string;
  outputWidth: number;
  outputHeight: number;
  bitrate: number;
  frames: ScheduledFrame[];
};

/** Info received after the transcoding backend completes. */
export type EncodeResult = {
  uri: string;
  thumbnailUri: string;
  byteSize: number;
};

/**
 * Set transcode operation limits (see `TranscodeLimits`) or set a desired video bitrate. Note that
 * `bitrate` is target average bits/sec for variable bitrate encoding.
 */
export type TranscodeOptions = {
  limits?: Partial<TranscodeLimits>;
  bitrate?: number;
};

/** The video output after transcoding, along with metadata. */
export type TranscodeResult = {
  uri: string;
  thumbnailUri: string;
  width: number;
  height: number;
  durationMs: number;
  frameCount: number;
  byteSize: number;
};
