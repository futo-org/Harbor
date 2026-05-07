import { PolycentricClient } from '@polycentric/js-core';

import { NodeCryptoManager } from './crypto/node-crypto-manager.js';
import { createNodeStorageDriver } from './storage/better-sqlite3/index.js';
import { PolycentricCore, uniffiInitAsync } from './uniffi-init.js';

export interface CreatePolycentricNodeClientConfig {
  databasePath: string;
  seedServers?: string[];
}

export async function createPolycentricNodeClient(
  config: CreatePolycentricNodeClientConfig,
): Promise<PolycentricClient> {
  await uniffiInitAsync();
  const core = new PolycentricCore();
  const { driver } = await createNodeStorageDriver(config.databasePath);
  return PolycentricClient.create({
    core,
    storageDriver: driver,
    cryptoManager: new NodeCryptoManager(),
    seedServers: config.seedServers,
  });
}
