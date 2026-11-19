import type {
  TranscodeBackend,
  TranscodeOptions,
  TranscodeResult,
} from './types';

export function createTranscoder(
  _backend: TranscodeBackend,
): (uri: string, options?: TranscodeOptions) => Promise<TranscodeResult> {
  return async () => {
    throw new Error('transcode: not implemented');
  };
}
