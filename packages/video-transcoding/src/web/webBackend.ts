import { TranscodeError } from '../limits';
import type {
  EncodeRequest,
  EncodeResult,
  SourceHeader,
  SourceLimits,
  TranscodeBackend,
} from '../types';
import type { WorkerMethods, WorkerResponse } from './workerProtocol';

/**
 * Web backend, runs in a web worker. The returned `uri` and `thumbnailUri` are object URLs. The
 * caller owns them and should revoke them once uploaded. See `TranscodeBackend` for more info.
 */
export const webBackend: TranscodeBackend = {
  async readHeader(uri: string, limits: SourceLimits): Promise<SourceHeader> {
    const blob = await fetchBlob(uri, limits.maxSourceBytes);
    return callWorker('readHeader', {
      blob,
      maxSourceFrames: limits.maxSourceFrames,
    });
  },

  async encode({ uri, ...request }: EncodeRequest): Promise<EncodeResult> {
    const blob = await fetchBlob(uri, Number.POSITIVE_INFINITY);
    const { video, thumbnail } = await callWorker('encode', { blob, request });
    return {
      uri: URL.createObjectURL(video),
      thumbnailUri: URL.createObjectURL(thumbnail),
      byteSize: video.size,
    };
  },
};

/** Runs one of the `WorkerMethods` in a new worker. See `workerProtocol.ts`. */
function callWorker<M extends keyof WorkerMethods>(
  method: M,
  args: WorkerMethods[M]['args'],
): Promise<WorkerMethods[M]['result']> {
  const worker = new Worker(new URL('./transcodeWorker', import.meta.url));
  return new Promise<WorkerMethods[M]['result']>((resolve, reject) => {
    worker.addEventListener(
      'message',
      ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.ok) {
          resolve(data.result as WorkerMethods[M]['result']);
        } else {
          reject(new TranscodeError(data.error.code, data.error.message));
        }
      },
    );
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      reject(
        new TranscodeError(
          'encode-failed',
          `The transcoding worker failed: ${event.message || 'unknown error'}`,
        ),
      );
    });
    worker.postMessage({ method, args });
  }).finally(() => worker.terminate());
}

async function fetchBlob(uri: string, maxSourceBytes: number): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(uri);
  } catch (error) {
    throw new TranscodeError('decode-failed', `Couldn't read ${uri}.`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new TranscodeError(
      'decode-failed',
      `Couldn't read ${uri} (HTTP ${response.status}).`,
    );
  }
  const declaredBytes = Number(response.headers.get('content-length'));
  if (declaredBytes > maxSourceBytes) {
    await response.body?.cancel();
    throw sourceTooLarge(declaredBytes, maxSourceBytes);
  }
  const blob = await response.blob();
  if (blob.size > maxSourceBytes) {
    throw sourceTooLarge(blob.size, maxSourceBytes);
  }
  return blob;
}

function sourceTooLarge(bytes: number, maxSourceBytes: number): TranscodeError {
  return new TranscodeError(
    'source-too-large',
    `The file is ${bytes} bytes, over the ${maxSourceBytes}-byte limit.`,
  );
}
