import {
  KEY_TYPE,
  type PolycentricClientConfig as CorePolycentricClientConfig,
  type PolycentricClient,
} from '@polycentric/js-core';

export interface CreatePolycentricClientConfig {
  databaseName?: string;
  hydration?: CorePolycentricClientConfig['hydration'];
}

export function normalizeDatabaseName(databaseName?: string) {
  return (databaseName ?? 'polycentric').trim() || 'polycentric';
}

export async function createIdentityWithDefaultServer(
  client: PolycentricClient,
  server: string
) {
  const keyPair = await client.createIdentity({
    keyType: KEY_TYPE.ED25519,
    setAsCurrent: true,
    ephemeral: false,
  });

  await client.createAddServer(server);

  return keyPair;
}
