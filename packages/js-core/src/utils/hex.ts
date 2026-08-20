import type * as Proto from '../proto/v2';

/**
 * Lowercase hex encoding of `bytes`. Optionally slice to `len` bytes
 * first for a short display form; pass `bytes.length` (or omit on the
 * full slice) to get the full hex.
 */
export function bytesToHex(bytes: Uint8Array, len?: number): string {
  const slice = len !== undefined ? bytes.slice(0, len) : bytes;
  return Array.from(slice)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Inverse of `bytesToHex`.
 * Decode a hex string to bytes (or undefined when the input is invalid).
 */
export function hexToBytes(hex: string): Uint8Array | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return undefined;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/**
 * Canonical string form of a `ContentDigest`: `{type}_{hex(value)}`.
 */
export function toDigestKey(digest: Proto.ContentDigest): string {
  return `${digest.type}_${bytesToHex(digest.value)}`;
}
