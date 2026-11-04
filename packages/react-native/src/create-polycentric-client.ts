import 'react-native-get-random-values';
import { Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  type Bindings,
  bytesToHex,
  generateWrappingKey,
  hexToBytes,
  openLocalClient,
  type PolycentricClient,
  registerBindings,
  wrappingKeyCipher,
} from '@polycentric/js-core';
import * as bindings from './generated/rn/polycentric_core';
import {
  type Application,
  setLogger,
  StorageConfig,
} from './generated/rn/polycentric_core';
import { createBatchingLogSink, normalizeDatabaseName } from './log-sink';

export interface CreatePolycentricClientConfig {
  databaseName?: string;
  /** Servers the client starts with. */
  seedServers?: string[];
  /** Stamped on every event the client creates. */
  application?: Application;
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  registerBindings(bindings as unknown as Bindings);
  setLogger(createBatchingLogSink());
}

/** A filesystem path from an expo-file-system `file://` URI. */
function toPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

/**
 * The key private keys are sealed under, kept in the iOS Keychain / Android
 * Keystore-backed secure store rather than next to the database. Created
 * on first use. Readable after the first unlock, so background work (push
 * notifications) can open the client.
 */
async function wrappingKey(name: string): Promise<Uint8Array> {
  const item = `harbor-wrapping-key.${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  const stored = await SecureStore.getItemAsync(item, options);
  const existing = stored ? hexToBytes(stored) : undefined;
  if (existing?.length === 32) return existing;
  const key = generateWrappingKey();
  await SecureStore.setItemAsync(item, bytesToHex(key), options);
  return key;
}

/**
 * Open a client on the device. The database and blobs stay where earlier
 * versions kept them (expo-sqlite's `SQLite/` directory and
 * `<name>-blobs/`), so existing installs keep their data; keys they stored
 * unsealed are sealed on first open.
 */
export async function createPolycentricClient(
  config: CreatePolycentricClientConfig = {},
): Promise<PolycentricClient> {
  install();
  const name = normalizeDatabaseName(config.databaseName);
  const documents = toPath(Paths.document.uri);
  return openLocalClient({
    storage: new StorageConfig.Sqlite({
      path: `${documents}/SQLite/${name}`,
      blobDirectory: `${documents}/${name}-blobs`,
    }),
    keyCipher: wrappingKeyCipher(await wrappingKey(name)),
    seedServers: config.seedServers,
    application: config.application,
  });
}
