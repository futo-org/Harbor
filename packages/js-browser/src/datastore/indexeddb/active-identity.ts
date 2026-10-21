import { bytesToHex } from '@polycentric/js-core';

/**
 * The `localStorage` key that maps a public key to its active identity.
 */
export function activeIdentityKey(publicKey: Uint8Array): string {
  return `polycentric:activeIdentity:${bytesToHex(publicKey, 32)}`;
}
