import { PolycentricClient } from '@polycentric/js-core';
import {
  BrowserCryptoManager,
  BrowserWasmBridge,
  IndexedDBStorageDriver,
} from '@polycentric/js-browser';
import polycentricWasmUrl from '@polycentric/rs-core-wasm-browser/polycentric_core_bg.wasm';
import {
  createIdentity,
  normalizeDatabaseName,
  type CreatePolycentricClientConfig,
} from './create-polycentric-client.shared';

export async function createPolycentricClient(
  config: CreatePolycentricClientConfig = {}
): Promise<PolycentricClient> {
  const databaseName = normalizeDatabaseName(config.databaseName);

  return PolycentricClient.create({
    coreBridge: new BrowserWasmBridge(polycentricWasmUrl),
    storageDriver: await IndexedDBStorageDriver.create(databaseName),
    cryptoManager: new BrowserCryptoManager(),
    seedServers: config.seedServers,
  });
}

export { createIdentity };
export type { CreatePolycentricClientConfig };
