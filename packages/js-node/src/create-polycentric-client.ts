import type { PolycentricClient } from '@polycentric/js-core';

export interface CreatePolycentricNodeClientConfig {
  databasePath: string;
  seedServers?: string[];
}

// TODO Use uniffi-generated PolycentricCore
export async function createPolycentricNodeClient(
  _config: CreatePolycentricNodeClientConfig,
): Promise<PolycentricClient> {
  throw new Error(
    'createPolycentricNodeClient is not implemented yet. Use createNodeStorageDriver for storage-only access.',
  );
}
