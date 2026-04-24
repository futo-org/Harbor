import { v2 } from '@polycentric/react-native';
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

/**
 * BigInt-free mirror of `v2.EventKey`. The proto's `sequence` is a `bigint`,
 * which crashes React Native's render logger when any component receives it
 * as a prop — so we carry the sequence as a decimal string through the
 * UI/state layer and only convert back to `bigint` when talking to the core.
 */
export interface EventKeyRef {
  collection?: number;
  identity: string;
  signedBy?: v2.PublicKey;
  sequence: string;
}

export type PostData = {
  id: string;

  identity: v2.EventKey['identity'];
  signedBy: v2.PublicKey;
  sequence: string;

  content: string;
  createdAt: number;

  /** Attached image sets, in author-provided order. */
  images: v2.ImageSet[];

  /** Set when the underlying `v2.Post` carried a `reply`. */
  reply?: {
    root?: EventKeyRef;
    parent?: EventKeyRef;
  };

  signedEvent: v2.SignedEvent;
};

function eventKeyToRef(key: v2.EventKey | undefined): EventKeyRef | undefined {
  if (!key) return undefined;
  return {
    collection: key.collection,
    identity: key.identity,
    signedBy: key.signedBy,
    sequence: key.sequence.toString(),
  };
}

/** Canonical event key: author:process:logicalClock */
export function eventKey(
  authorKey: Uint8Array,
  process: Uint8Array,
  logicalClock: number,
): string {
  return `${bytesToHex(authorKey)}:${bytesToHex(process)}:${logicalClock}`;
}

/** Extract the sequence number (logicalClock) from an internal eventKey postId. */
export function postIdToSequence(postId: string): string | null {
  const parts = postId.split(':');
  if (parts.length !== 3) return null;
  return parts[2];
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

    const post = content.contentBody.post;
    const reply = post.reply
      ? {
          root: eventKeyToRef(post.reply.root),
          parent: eventKeyToRef(post.reply.parent),
        }
      : undefined;

    return {
      id,
      identity: key.identity,
      signedBy: key.signedBy,
      sequence: key.sequence.toString(),
      content: post.text,
      createdAt: Number(event.createdAt ?? 0),
      images: post.images,
      reply,
      signedEvent: v2.SignedEvent.create({
        eventBytes: bundle.signedEvent.eventBytes,
        signature: bundle.signedEvent.signature,
      }),
    };
  } catch {
    return null;
  }
}

/**
 * Dicebear identicon URL for a public key.
 */
export function identiconUrl(seed: string, size = 80): string {
  return `https://api.dicebear.com/7.x/identicon/png?seed=${seed}&size=${size}`;
}

/**
 * Pick the smallest image variant at or above `targetSize`. Falls back
 * to the largest available variant if none are big enough. Returns
 * `null` when the set is empty.
 */
export function pickImageVariant(
  imageSet: v2.ImageSet | null | undefined,
  targetSize: number,
): v2.Image | null {
  if (!imageSet || imageSet.images.length === 0) return null;
  const sorted = [...imageSet.images].sort((a, b) => a.width - b.width);
  return (
    sorted.find((img) => img.width >= targetSize) ?? sorted[sorted.length - 1]!
  );
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

export function pubkeyStr(key: v2.PublicKey): string {
  return Array.from(key.key ?? new Uint8Array()).join(',');
}

export function publicKeyToString(key: v2.PublicKey): string {
  const keyType = key.keyType ?? 0;
  const keyBytes = key.key ?? new Uint8Array();
  return `${keyType}_${bytesToHex(keyBytes)}`;
}

export function stringToPublicKey(str: string): v2.PublicKey {
  const idx = str.indexOf('_');
  const keyTypeStr = str.slice(0, idx);
  const keyHex = str.slice(idx + 1);
  return v2.PublicKey.create({
    keyType: Number(keyTypeStr),
    key: hexToBytes(keyHex),
  });
}

export function publicKeyToStringURLSafe(key: v2.PublicKey): string {
  return publicKeyToString(key);
}

export function stringURLSafeToPublicKey(str: string): v2.PublicKey {
  return stringToPublicKey(str);
}

/**
 * @deprecated misnamed — this returns a short base64 form of the signer's
 * public key, not the identity id. Use {@link shortenIdentityId} or render
 * the v2 `key.identity` string directly.
 */
export function getIdentityId(publicKey: v2.PublicKey): string {
  const bytes = publicKey.key ?? new Uint8Array();
  if (bytes.length === 0) return '...';
  return toBase64(bytes).slice(0, 10);
}

export function getIdentityIdShort(publicKey: v2.PublicKey): string {
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

export function pointerToURLString(pointer: v2.Pointer): string {
  const systemStr = publicKeyToString(pointer.system ?? v2.PublicKey.create());
  const processStr = bytesToHex(pointer.process?.process ?? new Uint8Array());
  const clockStr = String(pointer.logicalClock ?? 0);
  return `${systemStr}.${processStr}.${clockStr}`;
}

export function signedEventToHex(signedEvent: v2.SignedEvent): string {
  return bytesToHex(v2.SignedEvent.toBinary(signedEvent));
}

export function hexToSignedEvent(hex: string): v2.SignedEvent {
  return v2.SignedEvent.fromBinary(hexToBytes(hex));
}
