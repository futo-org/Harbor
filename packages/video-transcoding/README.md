# @polycentric/video-transcoding

Note: this is currently WIP.

On-device transcoding to H.264 MP4 for Expo apps, using MediaCodec on Android,
VideoToolbox/`AVAssetWriter` on iOS, and WebCodecs/mediabunny on web. No bundled software encoder.

Input is animated GIF for now. We would like to support other animated image formats (animated WebP,
APNG) and video input in the future. The pipeline is built so each new input only needs its own
header reader and frame decoder.

> Short note on why: we want to transcode GIFs to video because video codecs compress better and
> less space. The Polycentric protocol requires identities to sign the content they post (including
> images and video) using on-device signing keys. Thus, we need to produce the transcoded video
> on-device before posting.

## Usage

```ts
import { transcode, TranscodeError } from '@polycentric/video-transcoding';

const { uri, posterUri, width, height, durationMs, frameCount } =
  await transcode(gifUri, {
    limits: { maxOutputFrames: 200, maxOutputPixels: 1_000_000, maxOutputBytes: 5_000_000 },
  });
```

The output is H.264 Constrained Baseline, yuv420, no audio, with transparent
pixels flattened onto black.

See the `TranscodeLimits` type for more information on the limits.

## How it works

`transcode(uri, options)` runs a Typescript pipeline on every platform, which first
reads headers, then streams decoded frames one-by-one to the encoder. The frame may be scaled if the
resolution exceeds limits, and the color space will be converted to YUV. The `TranscodeBackend`,
implemented for each platform, handles the specifics of reading headers and encoding. If the total
output size of the video exceeds set limits, the video bitrate will be downscaled.
