import {
  BufferTarget,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  type VideoSample,
  VideoSampleSource,
} from 'mediabunny';

import { TranscodeError } from '../limits';

/** Encodes a stream of decoded frames into H.264 MP4 using WebCodecs video encoders. */
export class Mp4Encoder {
  private readonly source: VideoSampleSource;
  private readonly output: Output<Mp4OutputFormat, BufferTarget>;

  private constructor(
    private readonly codecString: string,
    bitrate: number,
  ) {
    this.source = new VideoSampleSource({
      codec: 'avc',
      fullCodecString: codecString,
      bitrate,
      bitrateMode: 'variable',
      latencyMode: 'quality',
      keyFrameInterval: 2, // seconds
      alpha: 'discard',
      sizeChangeBehavior: 'deny',
    });
    this.output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    this.output.addVideoTrack(this.source);
  }

  static async create(
    width: number,
    height: number,
    bitrate: number,
    frameRate: number,
  ): Promise<Mp4Encoder> {
    const codecString = constrainedBaselineCodecString(
      width,
      height,
      frameRate,
    );
    const supported = await canEncodeVideo('avc', {
      width,
      height,
      bitrate,
      frameRate,
      fullCodecString: codecString,
    }).catch(() => false);
    if (!supported) {
      throw new TranscodeError(
        'unsupported',
        `This browser can't encode H.264 (${codecString}) at ${width}x${height}.`,
      );
    }
    const encoder = new Mp4Encoder(codecString, bitrate);
    await encoder.output.start();
    return encoder;
  }

  /** Encodes a frame. Resolves when the encoder has finished the last added frame. */
  add(sample: VideoSample): Promise<void> {
    return this.source.add(sample);
  }

  /** Stops encoding and produces the final video blob. */
  async finish(): Promise<Blob> {
    this.source.close();
    await this.output.finalize();
    const buffer = this.output.target.buffer;
    if (!buffer) {
      throw new TranscodeError(
        'encode-failed',
        `The ${this.codecString} encoder produced no output.`,
      );
    }
    return new Blob([buffer], { type: 'video/mp4' });
  }

  /** Stops encoding and drops the output. Call if some failure occurs. */
  async cancel(): Promise<void> {
    await this.output.cancel().catch(() => {});
  }
}

/**
 * H.264 levels. Values are a tuple: (the bit pattern that signifies the level, max macroblocks
 * per frame, max macroblocks per second).
 */
const AVC_LEVELS: readonly [number, number, number][] = [
  [0x1e, 1620, 40_500], // 3.0
  [0x1f, 3600, 108_000], // 3.1
  [0x20, 5120, 216_000], // 3.2
  [0x28, 8192, 245_760], // 4.0
  [0x2a, 8704, 522_240], // 4.2
  [0x32, 22_080, 589_824], // 5.0
  [0x33, 36_864, 983_040], // 5.1
];

/**
 * Produces the string signifying Constrained Baseline profile for H.264 (which we use because it
 * has the most broad support). Then selects the lowest H.264 level that fits the desired image
 * dimensions/framerate.
 */
export function constrainedBaselineCodecString(
  width: number,
  height: number,
  frameRate: number,
): string {
  const widthMbs = Math.ceil(width / 16);
  const heightMbs = Math.ceil(height / 16);
  const frameMbs = widthMbs * heightMbs;
  const level =
    AVC_LEVELS.find(
      ([, maxFrameMbs, maxMbsPerSecond]) =>
        frameMbs <= maxFrameMbs &&
        frameMbs * frameRate <= maxMbsPerSecond &&
        // Keep the longest side under a formula described by the H.264 spec
        Math.max(widthMbs, heightMbs) <= Math.sqrt(8 * maxFrameMbs),
    )?.[0] ?? 0x33;
  return `avc1.42E0${level.toString(16).toUpperCase().padStart(2, '0')}`;
}
