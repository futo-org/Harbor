import { PolycentricClient } from '@polycentric/js-core';

import { createNodeStorageDriver } from './datastore/better-sqlite3/index.js';
import { createNodeFileStoreDriver } from './filestore/fs/index.js';
import { PolycentricCore, uniffiInitAsync } from './uniffi-init.js';

export interface CreatePolycentricNodeClientConfig {
  databasePath: string;
  blobDirectory: string;
  seedServers?: string[];
}

export async function createPolycentricNodeClient(
  config: CreatePolycentricNodeClientConfig,
): Promise<PolycentricClient> {
  await uniffiInitAsync();
  const core = new PolycentricCore();
  const { driver } = await createNodeStorageDriver(config.databasePath);
  const filestoreDriver = await createNodeFileStoreDriver(config.blobDirectory);
  return PolycentricClient.create({
    core,
    storageDriver: driver,
    filestoreDriver,
    seedServers: config.seedServers,
  });
}
