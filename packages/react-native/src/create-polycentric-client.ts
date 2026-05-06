import { PolycentricClient } from '@polycentric/js-core';
import { PolycentricCore } from './generated/rn/polycentric_core';
import { ReactNativeStorageDriver } from './storage/op-sqlite/storage-driver';
import { ReactNativeCryptoManager } from './crypto/react-native-crypto-manager';
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
    core: new PolycentricCore(),
    storageDriver: await ReactNativeStorageDriver.create(databaseName),
    cryptoManager: new ReactNativeCryptoManager(),
    seedServers: config.seedServers,
  });
}

export { createIdentity };
export type { CreatePolycentricClientConfig };
