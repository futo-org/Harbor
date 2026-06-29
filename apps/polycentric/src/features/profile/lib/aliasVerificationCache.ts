import { normalizeAlias } from '@polycentric/react-native';

/**
 * Process-lifetime, in-memory cache of alias <-> identity
 * relationships that have already passed bidirectional verification (the
 * domain's lookup document resolves to the identity, *and* that identity's
 * profile claims the alias back).
 *
 * Caching only verified pairs lets repeat navigations skip both the network
 * lookup and the profile round-trip. Both directions are stored together, so an
 * alias->identity verification also satisfies a later identity->alias lookup
 * (and vice versa). Entries live for the app session only; a profile that later
 * changes its alias won't be reflected until restart.
 */

// Normalised alias -> identity (stored as-is, for mounting the profile).
const identityByAlias = new Map<string, string>();
// Identity (lowercased, for case-insensitive lookup) -> normalised alias.
const aliasByIdentity = new Map<string, string>();

/**
 * The identity an alias has been verified to point at this session, or null if
 * it hasn't been verified yet (or the alias is malformed).
 */
export function getVerifiedIdentity(alias: string): string | null {
  const key = normalizeAlias(alias);
  return key ? (identityByAlias.get(key) ?? null) : null;
}

/**
 * The alias an identity has been verified to own this session, or null if
 * none has been verified.
 */
export function getVerifiedAlias(identity: string): string | null {
  return aliasByIdentity.get(identity.toLowerCase()) ?? null;
}

/**
 * Record an alias <-> identity pair that has passed verification. Stored in
 * both directions; a malformed alias is ignored.
 */
export function recordVerifiedAlias(alias: string, identity: string): void {
  const key = normalizeAlias(alias);
  if (!key) return;
  identityByAlias.set(key, identity);
  aliasByIdentity.set(identity.toLowerCase(), key);
}
