import { types, v2 } from '@polycentric/react-native';
import type { PolycentricClient } from '@polycentric/react-native';

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(bytes)));
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export type PostData = {
  id: string;
  content: string;
  authorPublicKey: types.PublicKey;
  /**
   * v2 identity key (hex sha256 of the initial Identity content) that the
   * author signed this post on behalf of. Undefined for legacy v1 posts,
   * which pre-date identity separation.
   */
  authorIdentity?: string;
  timestamp: number;
  parentAuthorPublicKey?: types.PublicKey;
  parentProcess?: types.Process;
  parentLogicalClock?: number;
  signedEvent: types.SignedEvent;
};

/** Canonical event key: author:process:logicalClock */
export function eventKey(
  authorKey: Uint8Array,
  process: Uint8Array,
  logicalClock: number,
): string {
  return `${bytesToHex(authorKey)}:${bytesToHex(process)}:${logicalClock}`;
}

/** Parse postId (event key) into components for fetching. Returns null if invalid. */
export function parsePostId(postId: string): {
  authorPublicKey: types.PublicKey;
  process: Uint8Array;
  logicalClock: number;
} | null {
  const parts = postId.split(':');
  if (parts.length !== 3) return null;
  const [authorHex, processHex, clockStr] = parts;
  const logicalClock = parseInt(clockStr, 10);
  if (Number.isNaN(logicalClock)) return null;
  try {
    return {
      authorPublicKey: types.PublicKey.create({
        keyType: 1n, // Ed25519
        key: hexToBytes(authorHex),
      }),
      process: hexToBytes(processHex),
      logicalClock,
    };
  } catch {
    return null;
  }
}

/** Extract the sequence number (logicalClock) from an internal eventKey postId. */
export function postIdToSequence(postId: string): string | null {
  const parts = postId.split(':');
  if (parts.length !== 3) return null;
  return parts[2];
}

export function decodePostEvent(
  signedEvent: types.SignedEvent,
): PostData | null {
  try {
    const eventBytes = signedEvent.event;
    if (!eventBytes) return null;

    const event = types.Event.fromBinary(eventBytes);
    if (Number(event.contentType) !== types.ContentType.POST) return null;

    const authorKey = event.system?.key;
    const process = event.process?.process;
    if (!authorKey || !process || event.logicalClock == null) return null;

    const post = types.Post.fromBinary(event.content);

    // Extract parent author from references (for replies)
    /** Reference.ReferenceType.Pointer from polycentric.proto (not exported by generated protocol types). */
    const REFERENCE_TYPE_POINTER = 2n;
    let parentAuthorPublicKey: types.PublicKey | undefined;
    let parentProcess: types.Process | undefined;
    let parentLogicalClock: number | undefined;
    if (event.references && event.references.length > 0) {
      const ref = event.references[0];
      const isPointerRef =
        ref &&
        ref.referenceType === REFERENCE_TYPE_POINTER &&
        ref.reference &&
        ref.reference.length > 0;
      if (isPointerRef) {
        try {
          const parentPointer = types.Pointer.fromBinary(ref.reference);
          if (parentPointer.system?.key) {
            parentAuthorPublicKey = parentPointer.system;
          }
          if (parentPointer.process?.process) {
            parentProcess = parentPointer.process;
          }
          if (parentPointer.logicalClock != null) {
            parentLogicalClock = Number(parentPointer.logicalClock);
          }
        } catch {}
      }
    }

    return {
      id: eventKey(authorKey, process, Number(event.logicalClock)),
      content: post.content ?? '',
      authorPublicKey: event.system ?? types.PublicKey.create(),
      timestamp: Number(event.unixMilliseconds ?? 0),
      parentAuthorPublicKey,
      parentProcess,
      parentLogicalClock,
      signedEvent,
    };
  } catch {
    return null;
  }
}

/** Decode a v2 EventBundle into PostData, or null if not a post. */
export function decodeV2PostBundle(bundle: v2.EventBundle): PostData | null {
  try {
    if (!bundle.signedEvent) return null;
    const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
    const key = event.key;
    if (!key?.signedBy?.key) return null;

    if (!bundle.serializedContent?.contentBytes) return null;
    const content = v2.Content.fromBinary(
      bundle.serializedContent.contentBytes,
    );
    if (content.contentBody.oneofKind !== 'post') return null;

    const authorKey = key.signedBy.key;
    const identityBytes = new TextEncoder().encode(key.identity);
    const id = eventKey(authorKey, identityBytes, Number(key.sequence));

    return {
      id,
      content: content.contentBody.post.text,
      authorPublicKey: types.PublicKey.create({
        keyType: key.signedBy.keyType,
        key: authorKey,
      }),
      authorIdentity: key.identity,
      timestamp: Number(event.createdAt),
      // v1 compat shim — store expects types.SignedEvent
      signedEvent: types.SignedEvent.create({
        event: bundle.signedEvent.eventBytes,
        signature: bundle.signedEvent.signature,
      }) as types.SignedEvent,
    };
  } catch {
    return null;
  }
}

// Build a Pointer from a SignedEvent. Tries v2 decode first, falls back to v1.
export function getPointer(
  _client: PolycentricClient,
  signedEvent: types.SignedEvent,
): types.Pointer {
  // Try v2 event format first (eventBytes field stored in .event shim)
  try {
    const v2Event = v2.Event.fromBinary(signedEvent.event);
    if (v2Event.key?.signedBy) {
      return types.Pointer.create({
        system: types.PublicKey.create({
          keyType: v2Event.key.signedBy.keyType,
          key: v2Event.key.signedBy.key,
        }),
      });
    }
  } catch {
    /* not v2 format */
  }

  // Fall back to v1
  const event = types.Event.fromBinary(signedEvent.event);
  return types.Pointer.create({
    system: event.system,
    process: event.process,
    logicalClock: event.logicalClock,
  });
}

/** Post id (event key) from a pointer, for store lookups. */
export function pointerToPostId(pointer: types.Pointer): string {
  const key = pointer.system?.key;
  const process = pointer.process?.process;
  const clock = pointer.logicalClock;
  if (!key?.length || !process?.length || clock == null) return '';
  return eventKey(key, process, Number(clock));
}

/**
 * Dicebear identicon URL for a public key.
 */
export function identiconUrl(pubkey: types.PublicKey, size = 80): string {
  const seed = getIdentityId(pubkey);
  return `https://api.dicebear.com/7.x/identicon/png?seed=${seed}&size=${size}`;
}

export function timeAgo(unixMs: number): string {
  if (!unixMs) return '';
  const diff = Date.now() - unixMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function truncateName(name: string, maxLen = 16): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen).trimEnd() + '\u2026';
}

export function pubkeyStr(key: types.PublicKey): string {
  return Array.from(key.key ?? new Uint8Array()).join(',');
}

export function publicKeyToString(key: types.PublicKey): string {
  const keyType = key.keyType ?? 0;
  const keyBytes = key.key ?? new Uint8Array();
  return `${keyType}_${toHex(keyBytes)}`;
}

export function stringToPublicKey(str: string): types.PublicKey {
  const idx = str.indexOf('_');
  const keyTypeStr = str.slice(0, idx);
  const keyHex = str.slice(idx + 1);
  return types.PublicKey.create({
    keyType: Number(keyTypeStr),
    key: fromHex(keyHex),
  });
}

export function publicKeyToStringURLSafe(key: types.PublicKey): string {
  return publicKeyToString(key);
}

export function stringURLSafeToPublicKey(str: string): types.PublicKey {
  return stringToPublicKey(str);
}

/**
 * @deprecated misnamed — this returns a short base64 form of the signer's
 * public key, not the identity id. Use {@link shortenIdentityId} or render
 * the v2 `key.identity` string directly.
 */
export function getIdentityId(publicKey: types.PublicKey): string {
  const bytes = publicKey.key ?? new Uint8Array();
  if (bytes.length === 0) return '...';
  return toBase64(bytes).slice(0, 10);
}

export function getIdentityIdShort(publicKey: types.PublicKey): string {
  return getIdentityId(publicKey).slice(0, 4);
}

/**
 * Short display form of a v2 identity id (hex sha256 of the initial
 * Identity content). Returns a placeholder if the id is empty.
 */
export function shortenIdentityId(
  identity: string | undefined,
  len = 10,
): string {
  if (!identity) return '...';
  return identity.slice(0, len);
}

export function pointerToURLString(pointer: types.Pointer): string {
  const systemStr = publicKeyToString(
    pointer.system ?? types.PublicKey.create(),
  );
  const processStr = toHex(pointer.process?.process ?? new Uint8Array());
  const clockStr = String(pointer.logicalClock ?? 0);
  return `${systemStr}.${processStr}.${clockStr}`;
}

export function urlStringToPointer(str: string): types.Pointer {
  const parts = str.split('.');
  const systemStr = parts[0];
  const processStr = parts[1];
  const clockStr = parts[2];
  return types.Pointer.create({
    system: stringToPublicKey(systemStr),
    process: types.Process.create({ process: fromHex(processStr) }),
    logicalClock: BigInt(clockStr),
  });
}

export function signedEventToHex(signedEvent: types.SignedEvent): string {
  return bytesToHex(types.SignedEvent.toBinary(signedEvent));
}

export function hexToSignedEvent(hex: string): types.SignedEvent {
  return types.SignedEvent.fromBinary(hexToBytes(hex));
}
