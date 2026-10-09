// A minimal gRPC-Web client for unary calls, enough for the Try it panels.
// See https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-WEB.md.

const STATUS_NAMES = [
  'OK',
  'CANCELLED',
  'UNKNOWN',
  'INVALID_ARGUMENT',
  'DEADLINE_EXCEEDED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION',
  'ABORTED',
  'OUT_OF_RANGE',
  'UNIMPLEMENTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DATA_LOSS',
  'UNAUTHENTICATED',
];

export function statusName(code: number): string {
  return STATUS_NAMES[code] ?? `STATUS_${code}`;
}

export type GrpcWebResult = {
  /** gRPC status code; 0 is OK. */
  status: number;
  message: string;
  /** The response message, when the server sent one. */
  payload: Uint8Array | null;
  httpStatus: number;
  durationMs: number;
};

export type GrpcWebRequest = {
  baseUrl: string;
  /** `package.Service/Method` */
  method: string;
  body: Uint8Array;
  authorization?: string;
  signal?: AbortSignal;
};

const TRAILER_FLAG = 0x80;

function decodeMessage(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseTrailers(data: Uint8Array): Record<string, string> {
  const trailers: Record<string, string> = {};
  for (const line of new TextDecoder().decode(data).split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    trailers[line.slice(0, colon).trim().toLowerCase()] = line
      .slice(colon + 1)
      .trim();
  }
  return trailers;
}

export async function grpcWebUnary(
  request: GrpcWebRequest,
): Promise<GrpcWebResult> {
  const { body } = request;
  const frame = new Uint8Array(5 + body.length);
  new DataView(frame.buffer).setUint32(1, body.length, false);
  frame.set(body, 5);

  const headers: Record<string, string> = {
    'content-type': 'application/grpc-web+proto',
    accept: 'application/grpc-web+proto',
    'x-grpc-web': '1',
  };
  if (request.authorization) headers.authorization = request.authorization;

  const started = performance.now();
  const response = await fetch(
    `${request.baseUrl.replace(/\/+$/, '')}/${request.method}`,
    { method: 'POST', headers, body: frame, signal: request.signal },
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const durationMs = Math.round(performance.now() - started);
  const httpStatus = response.status;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/grpc-web')) {
    const text = new TextDecoder().decode(bytes).trim();
    return {
      status: 2,
      message: `HTTP ${httpStatus}${text ? `: ${text.slice(0, 500)}` : ''}`,
      payload: null,
      httpStatus,
      durationMs,
    };
  }

  let payload: Uint8Array | null = null;
  let trailers: Record<string, string> = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset] ?? 0;
    const length = view.getUint32(offset + 1, false);
    const data = bytes.subarray(offset + 5, offset + 5 + length);
    offset += 5 + length;
    if (flags & TRAILER_FLAG) {
      trailers = { ...trailers, ...parseTrailers(data) };
    } else if (payload === null) {
      payload = data;
    }
  }

  const statusHeader =
    trailers['grpc-status'] ?? response.headers.get('grpc-status');
  const status =
    statusHeader !== null && statusHeader !== undefined
      ? Number(statusHeader)
      : payload
        ? 0
        : 2;
  const message = decodeMessage(
    trailers['grpc-message'] ?? response.headers.get('grpc-message') ?? '',
  );
  return { status, message, payload, httpStatus, durationMs };
}
