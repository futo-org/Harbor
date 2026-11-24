import { TranscodeError } from '../limits';

let supported: Promise<void> | undefined;

/**
 * Throws a `TranscodeError` if the GIF decoder, video encoder, or offscreen canvas (where the frame
 * of a GIF gets stored while encoding to a video) is not supported in the browser.
 *
 * As of Nov 23, 2026, Firefox on Android does not have the video encoder required, and Safari <27.3
 * does not have the GIF decoder required.
 */
export function assertWebSupport(): Promise<void> {
  supported ??= findMissingApis().then((missing) => {
    if (missing.length > 0) {
      throw new TranscodeError(
        'unsupported',
        `This browser can't transcode GIFs (missing ${missing.join(', ')}).`,
      );
    }
  });
  return supported;
}

async function findMissingApis(): Promise<string[]> {
  const missing: string[] = [];
  if (
    typeof ImageDecoder === 'undefined' ||
    !(await ImageDecoder.isTypeSupported('image/gif').catch(() => false))
  ) {
    missing.push('ImageDecoder for GIF');
  }
  if (typeof VideoEncoder === 'undefined') {
    missing.push('VideoEncoder');
  }
  if (typeof OffscreenCanvas === 'undefined') {
    missing.push('OffscreenCanvas');
  }
  return missing;
}
