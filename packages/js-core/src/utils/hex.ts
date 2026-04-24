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
