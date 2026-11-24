import { TranscodeError } from '../limits';
import type { SourceFrameInfo, SourceHeader } from '../types';

// Significant bit patterns:
/** Begins a new frame of the GIF. */
const IMAGE_DESCRIPTOR = 0x2c;
/** Begins an extension block. We check for Graphic Control extensions specifically. */
const EXTENSION_INTRODUCER = 0x21;
/** Begins a Graphic Control block, which may be inserted before a frame to affect its delay. */
const GRAPHIC_CONTROL_LABEL = 0xf9;
/** Ends the GIF file. */
const TRAILER = 0x3b;

class TruncatedGifError extends TranscodeError {
  constructor() {
    super('decode-failed', 'The file ended unexpectedly.');
  }
}

class GifCursor {
  position = 0;

  constructor(private readonly data: Uint8Array) {}

  get atEnd(): boolean {
    return this.position >= this.data.length;
  }

  u8(): number {
    this.check(1);
    // biome-ignore lint/style/noNonNullAssertion: `check` confirmed the byte exists.
    return this.data[this.position++]!;
  }

  u16(): number {
    this.check(2);
    const i = this.position;
    this.position += 2;
    // biome-ignore lint/style/noNonNullAssertion: `check` confirmed both bytes exist.
    return this.data[i]! | (this.data[i + 1]! << 8);
  }

  bytes(length: number): Uint8Array {
    this.check(length);
    const i = this.position;
    this.position += length;
    return this.data.subarray(i, i + length);
  }

  /** Note that skipping past the end of the file fails on the next read. */
  skip(length: number): void {
    this.position += length;
  }

  private check(length: number): void {
    if (this.position + length > this.data.length) {
      throw new TruncatedGifError();
    }
  }
}

/**
 * Reads canvas dimensions, along with frame count, and positioning/dimensions/timing for each
 * frame of a GIF file. See `TranscodeBackend`.
 */
export async function parseGifHeader(
  blob: Blob,
  maxSourceFrames: number,
): Promise<SourceHeader> {
  const cursor = new GifCursor(new Uint8Array(await blob.arrayBuffer()));

  // Check GIF file format
  const signature = String.fromCharCode(...cursor.bytes(6));
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new TranscodeError('decode-failed', 'The file is not a GIF.');
  }

  // Get frame dimensions
  const canvasWidth = cursor.u16();
  const canvasHeight = cursor.u16();
  const screenFlags = cursor.u8();

  // Skip the rest of the header
  cursor.skip(2);
  skipColorTable(cursor, screenFlags);

  // Prepare to store frame info for each frame
  const frames: SourceFrameInfo[] = [];
  let pendingDelayMs = 0;

  try {
    while (!cursor.atEnd) {
      // Check the next byte, which determines which block follows. See the bit pattern constants
      // defined at the top of this file.
      const introducer = cursor.u8();
      if (introducer === TRAILER) {
        break;
      }
      if (introducer === EXTENSION_INTRODUCER) {
        const label = cursor.u8();
        if (label === GRAPHIC_CONTROL_LABEL) {
          // Set the delay for the following frame
          pendingDelayMs = readGraphicControlDelayMs(cursor);
        }
        skipSubBlocks(cursor);
      } else if (introducer === IMAGE_DESCRIPTOR) {
        // Read frame size
        const left = cursor.u16();
        const top = cursor.u16();
        const width = cursor.u16();
        const height = cursor.u16();
        const imageFlags = cursor.u8();

        // Skip the rest of the image block
        skipColorTable(cursor, imageFlags);
        cursor.skip(1); // LZW minimum code size
        skipSubBlocks(cursor);

        // Before recording another frame info, check if we've exceeded the limit of frames
        if (frames.length >= maxSourceFrames) {
          throw new TranscodeError(
            'source-too-many-frames',
            `The GIF has more than ${maxSourceFrames} frames.`,
          );
        }

        frames.push({ left, top, width, height, delayMs: pendingDelayMs });
        pendingDelayMs = 0;
      } else {
        throw new TranscodeError(
          'decode-failed',
          `Unknown GIF block 0x${introducer.toString(16)} at byte ${cursor.position - 1}.`,
        );
      }
    }
  } catch (error) {
    if (!(error instanceof TruncatedGifError)) {
      throw error;
    }
  }

  if (frames.length === 0) {
    throw new TranscodeError('decode-failed', 'The GIF has no frames.');
  }

  return { byteSize: blob.size, canvasWidth, canvasHeight, frames };
}

/** Checks whether the GIF colour table exists and skips it. */
function skipColorTable(cursor: GifCursor, flags: number): void {
  if (flags & 0x80) {
    cursor.skip(3 << ((flags & 0x07) + 1));
  }
}

/** Reads a Graphic Control extension's first sub-block and returns its delay in ms. */
function readGraphicControlDelayMs(cursor: GifCursor): number {
  const size = cursor.u8();

  // Improperly declared graphic control block; just return zero delay
  if (size < 4) {
    cursor.skip(size);
    return 0;
  }

  // Read delay, skip all other fields
  cursor.skip(1);
  const delayCentiseconds = cursor.u16();
  cursor.skip(size - 3);

  return delayCentiseconds * 10;
}

/**
 * Keeps reading in the first byte of each sub-block (which should be its size), and skipping,
 * until a size of zero is read (marking the end of the sub-blocks).
 */
function skipSubBlocks(cursor: GifCursor): void {
  for (let size = cursor.u8(); size !== 0; size = cursor.u8()) {
    cursor.skip(size);
  }
}
