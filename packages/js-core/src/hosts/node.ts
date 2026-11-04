/**
 * The Node host: runs rs-core's wasm build in-process, with its database in
 * an ordinary SQLite file reached through Node's `fs`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as wasm from '@polycentric/rs-core-wasm';
import { type Application, type Bindings, registerBindings } from '../bindings';
import { openLocalClient, wrappingKeyCipher } from '../local';
import type { PolycentricClient } from '../polycentric-client';

export interface NodeClientConfig {
  /** Path to the SQLite database file. Omit to keep everything in memory. */
  databasePath?: string;
  /**
   * The 32-byte key (or 64 hex characters) private keys are sealed under.
   * Required with `databasePath`; keep it outside the database (an
   * environment secret).
   */
  wrappingKey?: Uint8Array | string;
  seedServers?: string[];
  application?: Application;
}

/** Load the wasm module, give it Node's `fs`, and register its bindings. */
export async function initNodeBindings(): Promise<void> {
  (globalThis as { __polycentricNodeFs?: typeof fs }).__polycentricNodeFs = fs;
  await wasm.uniffiInitAsync();
  registerBindings(wasm as unknown as Bindings);
}

/** Open a client in Node. */
export async function createNodeClient(
  config: NodeClientConfig = {},
): Promise<PolycentricClient> {
  await initNodeBindings();
  const StorageConfig = wasm.StorageConfig;
  if (config.databasePath && !config.wrappingKey) {
    throw new Error(
      'A database needs a wrapping key so private keys are encrypted at rest.',
    );
  }
  return openLocalClient({
    storage: config.databasePath
      ? new StorageConfig.Sqlite({
          path: path.resolve(config.databasePath),
          blobDirectory: undefined,
        })
      : new StorageConfig.Memory(),
    keyCipher: config.wrappingKey
      ? wrappingKeyCipher(config.wrappingKey)
      : undefined,
    seedServers: config.seedServers,
    application: config.application,
  });
}
