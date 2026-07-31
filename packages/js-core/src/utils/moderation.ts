/**
 * Wire helpers for the fan-out moderation queries (`Query.IsModerator` /
 * `Query.IsBanned`). Unlike other queries, their merged response is not
 * a protobuf message but a JSON `serverUrl -> bool` map assembled by the
 * rust core, so consumers decode it with these helpers instead of a
 * generated proto class.
 */

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
