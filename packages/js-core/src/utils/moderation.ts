/**
 * Wire helpers for the fan-out moderation queries. Unlike other queries,
 * their merged response is not a protobuf message but a JSON map keyed by
 * server URL assembled by the rust core, so consumers decode it with these
 * helpers instead of a generated proto class.
 */

import { base64Decode, base64Encode } from './base64';

/**
 * Decode the merged `serverUrl -> bool` JSON map emitted by the fan-out
 * moderation queries. A server that failed to respond is absent from
 * the map; an empty payload decodes to an empty map.
 */
export function decodeStatusByServer(
  data: ArrayBuffer | Uint8Array,
): Map<string, boolean> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) {
    return new Map();
  }
  const record = JSON.parse(new TextDecoder().decode(bytes)) as Record<
    string,
    boolean
  >;
  return new Map(Object.entries(record));
}

/**
 * Decode the `serverUrl -> base64(response)` map from `Query.ListReports`
 * into each server's serialized response. A server that failed to respond
 * is absent.
 */
export function decodeBytesByServer(
  data: ArrayBuffer | Uint8Array,
): Map<string, Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) {
    return new Map();
  }
  const record = JSON.parse(new TextDecoder().decode(bytes)) as Record<
    string,
    string
  >;
  return new Map(
    Object.entries(record).map(([server, encoded]) => [
      server,
      base64Decode(encoded),
    ]),
  );
}

/** Inverse of `decodeBytesByServer`, for patching a cached result. */
export function encodeBytesByServer(
  bytesByServer: Map<string, Uint8Array>,
): ArrayBuffer {
  const record = Object.fromEntries(
    [...bytesByServer].map(([server, bytes]) => [server, base64Encode(bytes)]),
  );
  return new TextEncoder().encode(JSON.stringify(record)).buffer as ArrayBuffer;
}

/**
 * Encode a `serverUrl -> bool` map back into the moderation queries'
 * wire form — for patching a cached query result after a local
 * `SetBanStatus` mutation.
 */
export function encodeStatusByServer(
  statusByServer: Map<string, boolean>,
): ArrayBuffer {
  return new TextEncoder().encode(
    JSON.stringify(Object.fromEntries(statusByServer)),
  ).buffer as ArrayBuffer;
}
