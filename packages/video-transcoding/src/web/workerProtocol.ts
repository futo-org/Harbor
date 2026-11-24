import type { TranscodeErrorCode } from '../limits';
import type { SourceHeader } from '../types';
import type { EncodeBlobs, EncodePassInput } from './encodePass';

/**
 * Web workers must be passed a message in order to start the GIF transcode, and they must pass a
 * message back which points to the resulting video. This code defines a simple structure for
 * calling the backend functions with message passing, and returning the resulting video using a
 * message containing a URI to the video.
 */

export type WorkerMethods = {
  readHeader: {
    args: { blob: Blob; maxSourceFrames: number };
    result: SourceHeader;
  };
  encode: {
    args: { blob: Blob; request: EncodePassInput };
    result: EncodeBlobs;
  };
};

export type WorkerRequest =
  | { method: 'readHeader'; args: WorkerMethods['readHeader']['args'] }
  | { method: 'encode'; args: WorkerMethods['encode']['args'] };

export type WorkerResponse =
  | { ok: true; result: WorkerMethods[keyof WorkerMethods]['result'] }
  | { ok: false; error: WorkerError };

export type WorkerError = { code: TranscodeErrorCode; message: string };
