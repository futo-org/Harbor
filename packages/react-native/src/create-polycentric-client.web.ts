import { PolycentricClient } from '@polycentric/js-core';
import {
  BrowserCryptoManager,
  IndexedDBStorageDriver,
  OpfsFileStoreDriver,
} from '@polycentric/js-browser';
import {
  PolycentricCore,
  setLogger,
  uniffiInitAsync,
} from '@polycentric/rs-core-uniffi-web';
import {
  createBatchingLogSink,
  createIdentity,
  normalizeDatabaseName,
  type CreatePolycentricClientConfig,
} from './create-polycentric-client.shared';

let loggerInstalled = false;
function installConsoleLogger() {
  if (loggerInstalled) return;
  loggerInstalled = true;
  setLogger(createBatchingLogSink());
}

export async function createPolycentricClient(
  config: CreatePolycentricClientConfig = {},
): Promise<PolycentricClient> {
  const databaseName = normalizeDatabaseName(config.databaseName);
  const cryptoManager = new BrowserCryptoManager();

  // Load + initialize the wasm module before constructing the core.
  await uniffiInitAsync();
  installConsoleLogger();

  return PolycentricClient.create({
    core: new PolycentricCore(),
    storageDriver: await IndexedDBStorageDriver.create(databaseName),
    filestoreDriver: await OpfsFileStoreDriver.create(`${databaseName}-blobs`),
    cryptoManager,
    seedServers: config.seedServers,
  });
}

export { createIdentity };
export type { CreatePolycentricClientConfig };
