import { PolycentricClient } from '@polycentric/js-core';
import {
  BrowserCryptoManager,
  IndexedDBStorageDriver,
} from '@polycentric/js-browser';
import {
  PolycentricCore,
  setLogger,
  uniffiInitAsync,
} from '@polycentric/rs-core-uniffi-web';
import {
  createIdentity,
  normalizeDatabaseName,
  type CreatePolycentricClientConfig,
} from './create-polycentric-client.shared';

let loggerInstalled = false;
function installConsoleLogger() {
  if (loggerInstalled) return;
  loggerInstalled = true;
  setLogger({
    log: (message: string) => {
      console.log(message);
    },
  });
}

export async function createPolycentricClient(
  config: CreatePolycentricClientConfig = {}
): Promise<PolycentricClient> {
  const databaseName = normalizeDatabaseName(config.databaseName);

  // Load + initialize the wasm module before constructing the core.
  await uniffiInitAsync();
  installConsoleLogger();

  return PolycentricClient.create({
    core: new PolycentricCore(),
    storageDriver: await IndexedDBStorageDriver.create(databaseName),
    cryptoManager: new BrowserCryptoManager(),
    seedServers: config.seedServers,
  });
}

export { createIdentity };
export type { CreatePolycentricClientConfig };
