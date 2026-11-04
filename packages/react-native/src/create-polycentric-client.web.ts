import type { PolycentricClient } from '@polycentric/js-core';
import { createWebClient } from '@polycentric/js-core/web';
import { type Application, setLogger } from '@polycentric/rs-core-wasm/web';
import { createBatchingLogSink, normalizeDatabaseName } from './log-sink';

export interface CreatePolycentricClientConfig {
  databaseName?: string;
  /** Servers the client starts with. */
  seedServers?: string[];
  /** Stamped on every event the client creates. */
  application?: Application;
}

let loggerInstalled = false;

/**
 * Open the client in the browser: one worker serves every tab, with SQLite
 * on the origin private file system; memory where the browser can't run it.
 */
export async function createPolycentricClient(
  config: CreatePolycentricClientConfig = {},
): Promise<PolycentricClient> {
  const client = await createWebClient({
    databaseName: normalizeDatabaseName(config.databaseName),
    seedServers: config.seedServers,
    application: config.application,
  });
  if (!loggerInstalled) {
    loggerInstalled = true;
    setLogger(createBatchingLogSink());
  }
  return client;
}
