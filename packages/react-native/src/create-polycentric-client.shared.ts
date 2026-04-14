import type { PolycentricClient } from '@polycentric/js-core';

export interface CreatePolycentricClientConfig {
  databaseName?: string;
}

export function normalizeDatabaseName(databaseName?: string) {
  return (databaseName ?? 'polycentric').trim() || 'polycentric';
}

/**
 * Publishes a new Identity document authorized by the client's current
 * keypair, and registers `server` so the new identity is synced there.
 *
 * The keypair itself is auto-created by `PolycentricClient.initialize()`
 * on every device — this helper is specifically the identity-creation
 * step of onboarding (the "I am starting a new identity" path).
 *
 * For the "join an existing identity" path, use
 * `client.identityManager.claim(identityKey)` instead.
 */
export async function createIdentity(
  client: PolycentricClient,
  server: string
) {
  if (!client.currentKeyPair) {
    throw new Error(
      'createIdentity: client has no current keypair. PolycentricClient.initialize() should have created one.'
    );
  }

  const currentKey = client.currentKeyPair.publicKey;
  await client.identityManager.publish(null, [currentKey], []);

  if (!client.servers.includes(server)) {
    client.servers.push(server);
  }
}
