import { PolycentricClient } from '@polycentric/js-core';
import { NativeCoreBridge } from './ffi/bridge';
import { ReactNativeStorageDriver } from './storage/op-sqlite/storage-driver';
import { ReactNativeCryptoManager } from './crypto/react-native-crypto-manager';
import {
  createIdentityWithDefaultServer,
  normalizeDatabaseName,
  type CreatePolycentricClientConfig,
} from './create-polycentric-client.shared';

export async function createPolycentricClient(
  config: CreatePolycentricClientConfig = {}
): Promise<PolycentricClient> {
  const databaseName = normalizeDatabaseName(config.databaseName);

  return PolycentricClient.create({
    coreBridge: new NativeCoreBridge(),
    storageDriver: await ReactNativeStorageDriver.create(databaseName),
    cryptoManager: new ReactNativeCryptoManager(),
  });
}

export { createIdentityWithDefaultServer };
export type { CreatePolycentricClientConfig };
