import { TranscodeError } from '../limits';
import { encodePass } from './encodePass';
import { parseGifHeader } from './gifHeader';
import { assertWebSupport } from './support';
import type {
  WorkerError,
  WorkerRequest,
  WorkerResponse,
} from './workerProtocol';

/**
 * Web Worker entry point for running the transcoding backend. Receives messages from the main
 * thread, and turns them into function calls, then returns the result/error as a message. The
 * worker is started in the `webBackend.ts` file.
 */

self.addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
  void handle(data).then((response: WorkerResponse) =>
    self.postMessage(response),
  );
});

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  try {
    await assertWebSupport();
    const result =
      request.method === 'readHeader'
        ? await parseGifHeader(request.args.blob, request.args.maxSourceFrames)
        : await encodePass(request.args.blob, request.args.request);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: toWorkerError(error) };
  }
}

function toWorkerError(error: unknown): WorkerError {
  if (error instanceof TranscodeError) {
    return { code: error.code, message: error.message };
  }
  const detail = error instanceof Error ? `: ${error.message}` : '';
  return { code: 'encode-failed', message: `Transcoding failed${detail}` };
}
