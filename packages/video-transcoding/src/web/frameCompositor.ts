import { VideoSample } from 'mediabunny';

import { TranscodeError } from '../limits';

/**
 * Draws each decoded frame onto an `OffscreenCanvas` at the output size, then returns it as a
 * `VideoSample` for the video encoder to use.
 */
export class FrameCompositor {
  private readonly canvas: OffscreenCanvas;
  private readonly context: OffscreenCanvasRenderingContext2D;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = new OffscreenCanvas(width, height);
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new TranscodeError(
        'unsupported',
        'This browser has no 2D OffscreenCanvas.',
      );
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    this.context = context;
  }

  /**
   * Returns a `VideoSample` (for feeding into the video encoder) from a decoded frame. Note that it
   * is the caller's responsibility to close the returned `VideoSample`.
   */
  compose(
    image: CanvasImageSource,
    timestampUs: number,
    durationUs: number,
  ): VideoSample {
    this.context.fillStyle = '#000000';
    this.context.fillRect(0, 0, this.width, this.height);
    this.context.drawImage(image, 0, 0, this.width, this.height);
    return new VideoSample(this.canvas, {
      timestamp: timestampUs / 1_000_000,
      duration: durationUs / 1_000_000,
    });
  }

  /** Returns the last frame called with `compose` as a PNG, for the thumbnail. */
  snapshot(): Promise<Blob> {
    return this.canvas.convertToBlob({ type: 'image/png' });
  }
}
