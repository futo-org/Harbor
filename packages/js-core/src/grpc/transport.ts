import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import * as Proto from '../proto/v2';

let grpcWebFetch: typeof fetch | undefined;

// protobuf-ts's grpc-web transport reads `response.body` as a stream.
// React Native's default fetch path does not reliably provide that, which
// causes `RpcError: missing response body`
//
// We keep the transport generic here and let the Expo app inject a fetch
// implementation that does expose a usable body stream.
// See:
// - https://github.com/timostamm/protobuf-ts/blob/657e64e80009e503e94f608fda423fbcbf4fb5a7/packages/grpcweb-transport/src/grpc-web-transport.ts#L235
// - https://github.com/facebook/react-native/issues/27741#issuecomment-2362901032
export function setGrpcWebFetch(fetchImpl?: typeof fetch) {
  grpcWebFetch = fetchImpl;
}

function grpcWebTransport(serverUrl: string) {
  return new GrpcWebFetchTransport({
    baseUrl: serverUrl,
    fetch: grpcWebFetch,
  });
}

export async function listEvents(
  serverUrl: string,
  size?: number | null,
  identity?: string | null,
  collection?: number | null,
  signedBy?: Uint8Array | null,
  signedByKeyType?: number | null,
  sequenceGt?: bigint | null,
  sequenceLt?: bigint | null,
): Promise<Proto.ListEventsResponse> {
  return new Proto.EventSyncServiceClient(
    grpcWebTransport(serverUrl),
  ).listEvents(
    Proto.ListEventsRequest.create({
      size: size ?? undefined,
      filters: {
        collection: collection ?? undefined,
        identity: identity ?? undefined,
        signedBy:
          signedBy != null
            ? { keyType: signedByKeyType ?? 1, key: signedBy }
            : undefined,
        sequenceGt: sequenceGt ?? undefined,
        sequenceLt: sequenceLt ?? undefined,
      },
    }),
  ).response;
}

export async function putEvents(
  serverUrl: string,
  request: Proto.PutEventsRequest,
): Promise<void> {
  await new Proto.EventSyncServiceClient(grpcWebTransport(serverUrl)).putEvents(
    request,
  ).response;
}

export async function getFeed(
  serverUrl: string,
  algorithm: number,
  limit?: number | null,
  identity?: string | null,
): Promise<Proto.GetFeedResponse> {
  return new Proto.FeedsServiceClient(grpcWebTransport(serverUrl)).getFeed(
    Proto.GetFeedRequest.create({
      algorithm,
      limit: limit ?? undefined,
      identity: identity ?? undefined,
    }),
  ).response;
}

export async function getPostThread(
  serverUrl: string,
  request: Proto.GetPostThreadRequest,
): Promise<Proto.GetPostThreadResponse> {
  return new Proto.FeedsServiceClient(
    grpcWebTransport(serverUrl),
  ).getPostThread(request).response;
}

export async function uploadBlob(
  serverUrl: string,
  request: Proto.UploadBlobRequest,
): Promise<void> {
  await new Proto.ContentServiceClient(grpcWebTransport(serverUrl)).uploadBlob(
    request,
  ).response;
}

export async function getServerInfo(
  serverUrl: string,
): Promise<Proto.GetServerInfoResponse> {
  return new Proto.ServerServiceClient(grpcWebTransport(serverUrl)).getInfo(
    Proto.GetServerInfoRequest.create({}),
  ).response;
}

export async function createPairingSession(
  serverUrl: string,
  signedMessage: Proto.SignedMessage,
): Promise<Proto.PairingSession> {
  const response = await new Proto.PairingServiceClient(
    grpcWebTransport(serverUrl),
  ).createPairingSession(
    Proto.CreatePairingSessionRequest.create({ signedMessage }),
  ).response;
  if (!response.session) {
    throw new Error('gRPC-web CreatePairingSession missing session');
  }
  return response.session;
}

export async function getPairingSession(
  serverUrl: string,
  pairingSessionSignature: string,
): Promise<Proto.PairingSession> {
  const response = await new Proto.PairingServiceClient(
    grpcWebTransport(serverUrl),
  ).getPairingSession(
    Proto.GetPairingSessionRequest.create({
      pairingSessionSignature,
    }),
  ).response;
  if (!response.session) {
    throw new Error('gRPC-web GetPairingSession missing session');
  }
  return response.session;
}

export async function joinPairingSession(
  serverUrl: string,
  signedMessage: Proto.SignedMessage,
): Promise<Proto.PairingSession> {
  const response = await new Proto.PairingServiceClient(
    grpcWebTransport(serverUrl),
  ).joinPairingSession(
    Proto.JoinPairingSessionRequest.create({ signedMessage }),
  ).response;
  if (!response.session) {
    throw new Error('gRPC-web JoinPairingSession missing session');
  }
  return response.session;
}
