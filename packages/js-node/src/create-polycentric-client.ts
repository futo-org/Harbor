import type { IStorageDriver } from '@polycentric/js-core';
import { PolycentricClient } from '@polycentric/js-core';

import { createNodeStorageDriver } from './datastore/better-sqlite3/index.js';
import { createNodePgStorageDriver } from './datastore/postgres/index.js';
import { createNodeFileStoreDriver } from './filestore/fs/index.js';
import { PolycentricCore, uniffiInitAsync } from './uniffi-init.js';

export interface CreatePolycentricNodeClientConfig {
  /** Path to a sqlite file. Ignored when `databaseUrl` is set. */
  databasePath?: string;
  /**
   * A `postgres://` connection string — used instead of sqlite when set.
   * Append `?schema=<name>` to keep the tables under their own schema.
   */
  databaseUrl?: string;
  blobDirectory: string;
  seedServers?: string[];
}

export async function createPolycentricNodeClient(
  config: CreatePolycentricNodeClientConfig,
): Promise<PolycentricClient> {
  await uniffiInitAsync();
  const core = new PolycentricCore();

  let driver: IStorageDriver;
  if (config.databaseUrl) {
    ({ driver } = await createNodePgStorageDriver(config.databaseUrl));
  } else if (config.databasePath) {
    ({ driver } = await createNodeStorageDriver(config.databasePath));
  } else {
    throw new Error('Either databasePath or databaseUrl is required.');
  }

  const filestoreDriver = await createNodeFileStoreDriver(config.blobDirectory);
  return PolycentricClient.create({
    core,
    storageDriver: driver,
    filestoreDriver,
    seedServers: config.seedServers,
  });
}
