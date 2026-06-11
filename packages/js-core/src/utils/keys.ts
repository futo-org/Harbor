import { bytesEqual } from './bytes';
import { bytesToHex, hexToBytes } from './hex';
import * as Proto from '../proto/v2';

/**
 * Check if two public keys are equal by comparing keyType and key bytes.
 */
export function keysEqual(a: Proto.PublicKey, b: Proto.PublicKey): boolean {
  return a.keyType === b.keyType && bytesEqual(a.key, b.key);
}

/**
 * Canonical string form of a `PublicKey`: `{keyType}_{hex(key)}`.
 */
export function publicKeyToString(key: Proto.PublicKey): string {
  const keyType = key.keyType ?? 0;
  const keyBytes = key.key ?? new Uint8Array();
  return `${keyType}_${bytesToHex(keyBytes)}`;
}

/**
 * Parse the canonical string form of a `PublicKey`.
 */
export function stringToPublicKey(str: string): Proto.PublicKey {
  const idx = str.indexOf('_');
  if (idx === -1) {
    throw new Error(`Invalid public key string format: ${str}`);
  }
  const keyTypeStr = str.slice(0, idx);
  const keyHex = str.slice(idx + 1);
  return Proto.PublicKey.create({
    keyType: Number(keyTypeStr),
    key: hexToBytes(keyHex),
  });
}
