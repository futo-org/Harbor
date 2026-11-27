import { DEFAULT_SERVER } from '@/src/common/lib/polycentric-hooks';

type MessageType<T> = {
  create(value?: object): T;
  toBinary(message: T): Uint8Array;
  fromBinary(bytes: Uint8Array): T;
};

// Where the web server itself reaches the server, e.g. its address on the
// cluster network. Clients keep using `DEFAULT_SERVER`.
const SERVER_URL = (
  process.env.HARBOR_SERVER_INTERNAL_URL || DEFAULT_SERVER
).replace(/\/+$/, '');

/** One unary gRPC-web call to the server, e.g. `ProfileService/GetProfile` */
export async function unaryCall<Request, Response>(
  method: string,
  requestType: MessageType<Request>,
  responseType: MessageType<Response>,
  request: object,
  signal: AbortSignal,
): Promise<Response> {
  const message = requestType.toBinary(requestType.create(request));
  const body = new Uint8Array(5 + message.length);
  new DataView(body.buffer).setUint32(1, message.length);
  body.set(message, 5);

  const response = await fetch(`${SERVER_URL}/polycentric.v2.${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
    },
    body,
    signal,
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);

  const frames = new Uint8Array(await response.arrayBuffer());
  // Flag 0 is a message frame; an error response only has trailers (0x80)
  if (frames.length < 5 || frames[0] !== 0) {
    const status = response.headers.get('grpc-status') ?? 'no message';
    throw new Error(`${method}: grpc-status ${status}`);
  }

  const length = new DataView(frames.buffer).getUint32(1);
  return responseType.fromBinary(frames.subarray(5, 5 + length));
}
