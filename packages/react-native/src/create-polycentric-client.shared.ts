import {
  KEY_TYPE,
  type PolycentricClient,
} from '@polycentric/js-core';

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
  await client.createKeyPair({ keyType: KEY_TYPE.ED25519, setAsCurrent: true });
  await client.createIdentity();
  client.servers.push(server);
}
