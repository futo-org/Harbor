import { normalizeWebFingerHandle } from '@polycentric/react-native';

/**
 * Process-lifetime, in-memory cache of WebFinger alias <-> identity
 * relationships that have already passed bidirectional verification (the
 * domain's WebFinger document resolves to the identity, *and* that identity's
 * profile claims the alias back).
 *
 * Caching only verified pairs lets repeat navigations skip both the network
 * lookup and the profile round-trip. Both directions are stored together, so a
 * handle->identity verification also satisfies a later identity->handle lookup
 * (and vice versa). Entries live for the app session only; a profile that later
 * changes its alias won't be reflected until restart.
 */

// Normalised handle -> identity (stored as-is, for mounting the profile).
const identityByAlias = new Map<string, string>();
// Identity (lowercased, for case-insensitive lookup) -> normalised handle.
const aliasByIdentity = new Map<string, string>();

/**
 * The identity a handle has been verified to point at this session, or null if
 * it hasn't been verified yet (or the handle is malformed).
 */
export function getVerifiedIdentity(handle: string): string | null {
  const key = normalizeWebFingerHandle(handle);
  return key ? (identityByAlias.get(key) ?? null) : null;
}

/**
 * The handle an identity has been verified to own this session, or null if
 * none has been verified.
 */
export function getVerifiedAlias(identity: string): string | null {
  return aliasByIdentity.get(identity.toLowerCase()) ?? null;
}

/**
 * Record a handle <-> identity pair that has passed verification. Stored in
 * both directions; a malformed handle is ignored.
 */
export function recordVerifiedAlias(handle: string, identity: string): void {
  const key = normalizeWebFingerHandle(handle);
  if (!key) return;
  identityByAlias.set(key, identity);
  aliasByIdentity.set(identity.toLowerCase(), key);
}
