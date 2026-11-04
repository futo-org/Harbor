/**
 * Jest stand-in for `@polycentric/react-native`. rs-core can't load under
 * Jest, so this provides:
 *
 * - the real generated records, enums and factories (`v2.Post.create`,
 *   `ContentBody.Post`, `QueryData`, …), which are plain TypeScript;
 * - js-core's JavaScript pieces (errors, constants, hex helpers);
 * - deterministic fakes for the stateless rs-core functions app code calls
 *   (`eventKeyId`, label helpers, blob URLs, pairing codes).
 *
 * Use it whole (`jest.mock('@polycentric/react-native', () =>
 * jest.requireActual('@/test/polycentric'))`) or spread it into a mock that
 * overrides a few names.
 */
import type * as generated from '../../../packages/react-native/src/generated/rn/polycentric_core';

export * from '../../../packages/react-native/src/generated/rn/polycentric_core';
export * as v2 from '../../../packages/react-native/src/generated/rn/polycentric_core';
export * from '../../../packages/js-core/src/errors';
export { COLLECTION } from '../../../packages/js-core/src/constants';
export {
  bytesToHex,
  hexToBytes,
} from '../../../packages/js-core/src/utils/hex';
export {
  isIdentityKey,
  normalizeAlias,
} from '../../../packages/js-core/src/http/alias-resolver';

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const unhex = (s: string) =>
  Uint8Array.from(s.match(/../g) ?? [], (h) => Number.parseInt(h, 16));

/** Reversible stand-in for rs-core's id: hex, like the real one. */
export function eventKeyId(key: generated.EventKey): string {
  const json = JSON.stringify([
    key.identity,
    key.collection,
    key.signedBy?.keyType ?? 0,
    key.signedBy ? hex(key.signedBy.key) : '',
    key.sequence.toString(),
  ]);
  return hex(new TextEncoder().encode(json));
}

export function parseEventKeyId(id: string): generated.EventKey | undefined {
  try {
    const [identity, collection, keyType, key, sequence] = JSON.parse(
      new TextDecoder().decode(unhex(id)),
    );
    return {
      identity,
      collection,
      signedBy: { keyType, key: unhex(key).buffer as ArrayBuffer },
      sequence: BigInt(sequence),
    };
  } catch {
    return undefined;
  }
}

export function digestKey(digest: generated.ContentDigest): string {
  return `${digest.type}_${hex(digest.value)}`;
}

export function blobUrls(
  servers: string[],
  digest: generated.ContentDigest,
): string[] {
  return servers.map((s) => `${s}/blob/${digestKey(digest)}`);
}

export function imageProxyUrls(servers: string[], url: string): string[] {
  return servers.map((s) => `${s}/image_proxy?url=${encodeURIComponent(url)}`);
}

/** rs-common's `ModerationLabel::ALL`. */
export const MODERATION_LABELS = [
  'hate',
  'self-harm',
  'sexually-suggestive',
  'sexually-explicit',
  'violence',
];

export function moderationLabels(): string[] {
  return [...MODERATION_LABELS];
}

export function isModerationLabel(value: string): boolean {
  return MODERATION_LABELS.includes(value);
}

const labelKey = (l: generated.PostLabel) => `${l.value}\0${l.labeledBy}`;

export function mergeLabels(
  orig: generated.PostLabel[],
  latest: generated.PostLabel[],
): generated.PostLabel[] {
  const seen = new Set<string>();
  return [...orig, ...latest].filter((l) => {
    const key = labelKey(l);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function labelsChanged(
  a: generated.PostLabel[],
  b: generated.PostLabel[],
): boolean {
  if (a.length !== b.length) return true;
  const keys = new Set(a.map(labelKey));
  return b.some((l) => !keys.has(labelKey(l)));
}

export function encodePairingCode(info: generated.PairingInfo): string {
  return btoa(JSON.stringify([info.server, hex(info.digestSha256)]));
}

export function decodePairingCode(
  code: string,
): generated.PairingInfo | undefined {
  try {
    const [server, digest] = JSON.parse(atob(code.trim()));
    if (!server || !digest) return undefined;
    return { server, digestSha256: unhex(digest).buffer as ArrayBuffer };
  } catch {
    return undefined;
  }
}

export function validateContent(): never[] {
  return [];
}
