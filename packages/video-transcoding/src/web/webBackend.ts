import type {
  EncodeRequest,
  EncodeResult,
  SourceHeader,
  TranscodeBackend,
} from '../types';

/**
 * Web backend. See `TranscodeBackend` for more info.
 */
export const webBackend: TranscodeBackend = {
  async readHeader(
    _uri: string,
    _maxSourceBytes: number,
  ): Promise<SourceHeader> {
    throw new Error('webBackend.readHeader: not implemented');
  },

  async encode(_request: EncodeRequest): Promise<EncodeResult> {
    throw new Error('webBackend.encode: not implemented');
  },
};
