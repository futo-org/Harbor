/**
 * Opening a client in this JavaScript context, for hosts that run rs-core
 * in-process (React Native, Node, and the web's in-memory fallback).
 */
import {
  type Application,
  bindings,
  type KeyCipher,
  type StorageConfig,
} from './bindings';
import { wrapError } from './errors';
import { localHarbor } from './harbor';
import { PolycentricClient } from './polycentric-client';

export interface LocalClientConfig {
  storage: StorageConfig;
  /** Seals private keys at rest. Required unless storage is in memory. */
  keyCipher?: KeyCipher;
  /** Servers to use until the signed-in identity names its own. */
  seedServers?: string[];
  /** Stamped on every event the client creates. */
  application?: Application;
}

/** Open storage, hydrate rs-core and restore the stored login. */
export async function openLocalClient(
  config: LocalClientConfig,
): Promise<PolycentricClient> {
  const builder = new (bindings().HarborClientBuilder)({
    storage: config.storage,
    seedServers: config.seedServers ?? [],
    application: config.application,
  });
  if (config.keyCipher) builder.keyCipher(config.keyCipher);
  const client = await wrapError(() => builder.open());
  return PolycentricClient.open(localHarbor(client));
}

/** A key cipher sealing keys under a 32-byte wrapping key the host keeps
 * outside the database (a keystore, a secret). */
export function wrappingKeyCipher(key: Uint8Array | string): KeyCipher {
  const bytes =
    typeof key === 'string'
      ? Uint8Array.from(key.match(/../g) ?? [], (h) => Number.parseInt(h, 16))
      : key;
  if (bytes.length !== 32) {
    throw new Error('A wrapping key must be 32 bytes (64 hex characters).');
  }
  return bindings().aeadKeyCipher(bytes.slice().buffer as ArrayBuffer);
}

/** A fresh random wrapping key for `wrappingKeyCipher`. */
export function generateWrappingKey(): Uint8Array {
  return new Uint8Array(bindings().generateWrappingKey());
}
