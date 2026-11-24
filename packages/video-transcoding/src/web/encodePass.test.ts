import {
  BlobSource,
  EncodedPacketSink,
  Input,
  MP4,
  VideoSampleSink,
} from 'mediabunny';
import { describe, expect, it } from 'vitest';

import { DEFAULT_TRANSCODE_LIMITS } from '../limits';
import type { ScheduledFrame } from '../types';
import { encodePass } from './encodePass';
import { parseGifHeader } from './gifHeader';
import { constrainedBaselineCodecString } from './mp4Encoder';

type Rgb = [number, number, number];

const WIDTH = 64;
const HEIGHT = 48;
/**
 * References `four-colors.gif`: 64x48, solid red, green, blue and white frames, shown for 100, 100,
 * 200 and 100 ms.
 */
const FIXTURE = new URL('./__fixtures__/four-colors.gif', import.meta.url);
const FRAME_COLORS: Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 255],
];

describe('encodePass', () => {
  it('transcodes a GIF into a valid H.264 MP4', async () => {
    const gif = await (await fetch(FIXTURE)).blob();

    const header = await parseGifHeader(
      gif,
      DEFAULT_TRANSCODE_LIMITS.maxSourceFrames,
    );
    expect(header.canvasWidth).toBe(WIDTH);
    expect(header.canvasHeight).toBe(HEIGHT);
    expect(header.frames.map((frame) => frame.delayMs)).toEqual([
      100, 100, 200, 100,
    ]);

    const { video, thumbnail } = await encodePass(gif, {
      outputWidth: WIDTH,
      outputHeight: HEIGHT,
      bitrate: 500_000,
      frames: scheduleEveryFrame(header.frames),
    });

    expect(video.type).toBe('video/mp4');
    expect(thumbnail.type).toBe('image/png');

    const input = new Input({
      source: new BlobSource(video),
      formats: [MP4],
    });
    expect(await input.getFormat()).toBe(MP4);

    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error('The MP4 has no video track.');
    }
    expect(track.codec).toBe('avc');
    // The codec string comes from the encoder's SPS. The encoder may pick a lower level than the
    // one requested, but the profile must be Constrained Baseline (profile_idc 0x42 with
    // constraint_set1).
    const written = parseAvcCodecString(await track.getCodecParameterString());
    const requested = parseAvcCodecString(
      constrainedBaselineCodecString(WIDTH, HEIGHT, 10),
    );
    expect(written.profile).toBe(0x42);
    expect(written.constraints & 0x40).toBe(0x40);
    expect(written.level).toBeLessThanOrEqual(requested.level);
    expect(track.displayWidth).toBe(WIDTH);
    expect(track.displayHeight).toBe(HEIGHT);

    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      packets.push(packet);
    }
    expect(packets.map((packet) => packet.timestamp)).toEqual([
      0, 0.1, 0.2, 0.4,
    ]);
    expect(packets[0]?.type).toBe('key');
    expect(await track.computeDuration()).toBeCloseTo(0.5);

    // Decode the H.264 back and check each frame is the GIF frame's color.
    expect(await track.canDecode()).toBe(true);
    const colors: Rgb[] = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        colors.push(centerPixel(sample));
      } finally {
        sample.close();
      }
    }
    expect(colors).toHaveLength(FRAME_COLORS.length);
    colors.forEach((color, i) => {
      expectColorNear(color, FRAME_COLORS[i] ?? [0, 0, 0]);
    });
  });
});

/** Splits `avc1.PPCCLL` into profile_idc, constraint flags and level_idc. */
function parseAvcCodecString(codec: string | null): {
  profile: number;
  constraints: number;
  level: number;
} {
  const match = codec?.match(
    /^avc1\.([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i,
  );
  if (!match) {
    throw new Error(`${codec} is not an avc1 codec string.`);
  }
  const [profile, constraints, level] = match
    .slice(1)
    .map((hex) => Number.parseInt(hex, 16)) as [number, number, number];
  return { profile, constraints, level };
}

/** One output frame per GIF frame, timed by the GIF's delays. */
function scheduleEveryFrame(frames: { delayMs: number }[]): ScheduledFrame[] {
  let timestampUs = 0;
  return frames.map(({ delayMs }, sourceFrameIndex) => {
    const durationUs = delayMs * 1000;
    const frame = { sourceFrameIndex, timestampUs, durationUs };
    timestampUs += durationUs;
    return frame;
  });
}

function centerPixel(sample: {
  draw(context: OffscreenCanvasRenderingContext2D, x: number, y: number): void;
}): Rgb {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No 2D context.');
  }
  sample.draw(context, 0, 0);
  const [r = 0, g = 0, b = 0] = context.getImageData(
    WIDTH / 2,
    HEIGHT / 2,
    1,
    1,
  ).data;
  return [r, g, b];
}

/** Lossy H.264 and YUV conversion shift colors slightly. */
function expectColorNear(actual: Rgb, expected: Rgb): void {
  const distance = Math.max(
    ...actual.map((channel, i) => Math.abs(channel - (expected[i] ?? 0))),
  );
  expect(distance, `${actual} should be near ${expected}`).toBeLessThan(24);
}
