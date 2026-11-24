import { TranscodeError } from '../limits';

/** A decoded frame from a GIF; should be closed when finished. */
export type DecodedFrame = {
  image: CanvasImageSource;
  close(): void;
};

/** Decodes composited source frames, one frame at a time. */
export type FrameSource = {
  /** The composited canvas as shown at `sourceFrameIndex`. Indices must increase between calls. */
  decode(sourceFrameIndex: number): Promise<DecodedFrame>;
  close(): void;
};

/**
 * Creates a `FrameSource` using the browser's `ImageDecoder` and a `blob.stream()` which feeds one
 * frame at a time.
 */
export async function openFrameSource(
  blob: Blob,
  width: number,
  height: number,
): Promise<FrameSource> {
  if (
    typeof ImageDecoder === 'undefined' ||
    !(await ImageDecoder.isTypeSupported('image/gif'))
  ) {
    throw new TranscodeError(
      'unsupported',
      "This browser can't decode GIFs frame by frame (no ImageDecoder).",
    );
  }

  const decoder = new ImageDecoder({
    data: blob.stream(),
    type: 'image/gif',
    desiredWidth: width,
    desiredHeight: height,
    preferAnimation: true,
  });

  return {
    async decode(sourceFrameIndex) {
      try {
        const { image } = await decoder.decode({
          frameIndex: sourceFrameIndex,
          completeFramesOnly: true,
        });
        return { image, close: () => image.close() };
      } catch (error) {
        throw new TranscodeError(
          'decode-failed',
          `Couldn't decode GIF frame ${sourceFrameIndex}.`,
          { cause: error },
        );
      }
    },
    close() {
      decoder.close();
    },
  };
}
