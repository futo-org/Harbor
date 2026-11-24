import { TranscodeError } from '../limits';
import type { EncodeRequest } from '../types';
import { FrameCompositor } from './frameCompositor';
import { type FrameSource, openFrameSource } from './frameSource';
import { Mp4Encoder } from './mp4Encoder';

export type EncodeBlobs = {
  video: Blob;
  thumbnail: Blob;
};

export type EncodePassInput = Omit<EncodeRequest, 'uri'>;

/**
 * Encode pass first decodes each scheduled frame from the GIF, composites it at the output size,
 * then encodes to video, one frame at a time.
 */
export async function encodePass(
  blob: Blob,
  request: EncodePassInput,
): Promise<EncodeBlobs> {
  const { outputWidth, outputHeight, bitrate, frames } = request;
  const firstFrame = frames[0];
  if (!firstFrame) {
    throw new TranscodeError('encode-failed', 'No frames to encode.');
  }

  const encoder = await Mp4Encoder.create(
    outputWidth,
    outputHeight,
    bitrate,
    maxFrameRate(frames),
  );

  let source: FrameSource | undefined;
  let thumbnail: Blob | undefined;
  let video: Blob;
  try {
    const compositor = new FrameCompositor(outputWidth, outputHeight);
    source = await openFrameSource(blob, outputWidth, outputHeight);
    for (const frame of frames) {
      const decoded = await source.decode(frame.sourceFrameIndex);
      let sample: VideoSample;
      try {
        sample = compositor.compose(
          decoded.image,
          frame.timestampUs,
          frame.durationUs,
        );
      } finally {
        decoded.close();
      }
      try {
        if (frame === firstFrame) {
          thumbnail = await compositor.snapshot();
        }
        await encoder.add(sample);
      } finally {
        sample.close();
      }
    }
    video = await encoder.finish();
  } catch (error) {
    await encoder.cancel();
    throw error instanceof TranscodeError
      ? error
      : new TranscodeError('encode-failed', 'Encoding failed.', {
          cause: error,
        });
  } finally {
    source?.close();
  }

  if (!thumbnail) {
    throw new TranscodeError('encode-failed', 'No thumbnail was written.');
  }
  return { video, thumbnail };
}

/** Gets the maximum framerate of all frames provided. */
function maxFrameRate(frames: EncodePassInput['frames']): number {
  const shortest_microseconds = Math.min(
    ...frames.map((frame) => frame.durationUs),
  );
  return shortest_microseconds > 0 ? 1_000_000 / shortest_microseconds : 30;
}
