import * as Proto from '../proto/v2';

function grpcWebEncode(body: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + body.length);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, body.length, false);
  frame.set(body, 5);
  return frame;
}

function grpcWebDecodeFirst(buf: Uint8Array): Uint8Array {
  const dataLen = new DataView(buf.buffer, buf.byteOffset).getUint32(1, false);
  return buf.slice(5, 5 + dataLen);
}

const HEADERS = {
  'content-type': 'application/grpc-web+proto',
  accept: 'application/grpc-web+proto',
} as const;

export async function listEvents(
  serverUrl: string,
  size?: number | null,
  identity?: string | null,
  collection?: number | null,
  signedBy?: Uint8Array | null,
  signedByKeyType?: number | null,
  sequenceGt?: bigint | null,
  sequenceLt?: bigint | null,
): Promise<Uint8Array> {
  const request = Proto.ListEventsRequest.toBinary(
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
  );

  const res = await fetch(
    `${serverUrl}/polycentric.v2.EventSyncService/ListEvents`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(request).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web ListEvents error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}

export async function putEvents(
  serverUrl: string,
  eventBundlesBytes: Uint8Array,
): Promise<void> {
  const res = await fetch(
    `${serverUrl}/polycentric.v2.EventSyncService/PutEvents`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(eventBundlesBytes).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web PutEvents error: ${res.status}`);
}

export async function getFeed(
  serverUrl: string,
  algorithm: number,
  limit?: number | null,
  identity?: string | null,
): Promise<Uint8Array> {
  const request = Proto.GetFeedRequest.toBinary(
    Proto.GetFeedRequest.create({
      algorithm,
      limit: limit ?? undefined,
      identity: identity ?? undefined,
    }),
  );

  const res = await fetch(`${serverUrl}/polycentric.v2.FeedsService/GetFeed`, {
    method: 'POST',
    headers: HEADERS,
    body: grpcWebEncode(request).buffer as ArrayBuffer,
  });

  if (!res.ok) throw new Error(`gRPC-web GetFeed error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}

export async function uploadBlob(
  serverUrl: string,
  requestBytes: Uint8Array,
): Promise<void> {
  const res = await fetch(
    `${serverUrl}/polycentric.v2.ContentService/UploadBlob`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(requestBytes).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web UploadBlob error: ${res.status}`);
}

export async function getServerInfo(serverUrl: string): Promise<Uint8Array> {
  const request = Proto.GetServerInfoRequest.toBinary(
    Proto.GetServerInfoRequest.create({}),
  );

  const res = await fetch(`${serverUrl}/polycentric.v2.ServerService/GetInfo`, {
    method: 'POST',
    headers: HEADERS,
    body: grpcWebEncode(request).buffer as ArrayBuffer,
  });

  if (!res.ok) throw new Error(`gRPC-web GetInfo error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}

export async function getIdentityState(
  serverUrl: string,
  identityKey: string,
): Promise<Uint8Array> {
  const request = Proto.GetIdentityStateRequest.toBinary(
    Proto.GetIdentityStateRequest.create({ identity: identityKey }),
  );

  const res = await fetch(
    `${serverUrl}/polycentric.v2.IdentityService/GetIdentityState`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(request).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}

export async function createInvitation(
  serverUrl: string,
  signedMessage: Proto.SignedMessage,
): Promise<Uint8Array> {
  const request = Proto.SignedMessage.toBinary(signedMessage);

  const res = await fetch(
    `${serverUrl}/polycentric.v2.IdentityService/CreateInvitation`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(request).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}

export async function getInvitationStatus(
  serverUrl: string,
  invitationSignature: string,
): Promise<Uint8Array> {
  const request = Proto.GetInvitationStatusRequest.toBinary(
    Proto.GetInvitationStatusRequest.create({ invitationSignature }),
  );

  const res = await fetch(
    `${serverUrl}/polycentric.v2.IdentityService/GetInvitationStatus`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(request).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}

export async function claimInvitation(
  serverUrl: string,
  signedMessage: Proto.SignedMessage,
): Promise<Uint8Array> {
  const request = Proto.SignedMessage.toBinary(signedMessage);

  const res = await fetch(
    `${serverUrl}/polycentric.v2.IdentityService/ClaimInvitation`,
    {
      method: 'POST',
      headers: HEADERS,
      body: grpcWebEncode(request).buffer as ArrayBuffer,
    },
  );

  if (!res.ok) throw new Error(`gRPC-web error: ${res.status}`);

  return grpcWebDecodeFirst(new Uint8Array(await res.arrayBuffer()));
}
