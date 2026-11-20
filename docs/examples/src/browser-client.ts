// Shown on docs/content/developer/examples.md under "Creating a client".

// #region browser-client
import { PolycentricClient } from '@polycentric/js-core';
import {
  IndexedDBStorageDriver,
  OpfsFileStoreDriver,
} from '@polycentric/js-browser';
import {
  PolycentricCore,
  uniffiInitAsync,
} from '@polycentric/rs-core-wasm/web';

// #endregion browser-client

export async function createBrowserClient() {
  // #region browser-client
  await uniffiInitAsync();

  const client = await PolycentricClient.create({
    core: new PolycentricCore(),
    storageDriver: await IndexedDBStorageDriver.create('polycentric'),
    filestoreDriver: await OpfsFileStoreDriver.create('polycentric-blobs'),
    seedServers: ['http://localhost:3000'],
  });
  // #endregion browser-client
  return client;
}
