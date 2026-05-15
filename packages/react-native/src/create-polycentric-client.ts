import { PolycentricClient } from '@polycentric/js-core';
import { PolycentricCore, setLogger } from './generated/rn/polycentric_core';
import { createReactNativeStorageDriver } from './storage/expo-sqlite';
import { ReactNativeCryptoManager } from './crypto/react-native-crypto-manager';
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
  installConsoleLogger();
  const databaseName = normalizeDatabaseName(config.databaseName);

  return PolycentricClient.create({
    core: new PolycentricCore(),
    storageDriver: await createReactNativeStorageDriver(databaseName),
    cryptoManager: new ReactNativeCryptoManager(),
    seedServers: config.seedServers,
  });
}

export { createIdentity };
export type { CreatePolycentricClientConfig };
