import { KEY_TYPE, type PolycentricClient } from '@polycentric/js-core';

export interface CreatePolycentricClientConfig {
  databaseName?: string;
}

export function normalizeDatabaseName(databaseName?: string) {
  return (databaseName ?? 'polycentric').trim() || 'polycentric';
}

export async function createIdentityWithDefaultServer(
  client: PolycentricClient,
  server: string
) {
  await client.keyPairManager.createKeyPair({
    keyType: KEY_TYPE.ED25519,
    setAsCurrent: true,
  });

  // Publish initial identity with the current key as the sole rotation key
  const currentKey = client.currentKeyPair!.publicKey;
  await client.identityManager.publish(null, [currentKey], []);

  client.servers.push(server);
}
