// wasm bridge
export {
  BrowserWasmBridge,
  __killWasmInstance,
  type ModuleOrPath,
} from './wasm-bridge';

export type { PolycentricWasm } from '@polycentric/rs-core-wasm-browser';

// crypto implementations
export { ED25519KeyManager } from './crypto/ed25519-key-manager';
export { BrowserCryptoManager } from './crypto/browser-crypto-manager';

// storage
export type { StorageHandle, Repositories } from '@polycentric/js-core';

export {
  _createIndexedDBDatabase,
  IndexedDBDatabase,
} from './storage/indexeddb/database';
export { IndexedDBStorageDriver } from './storage/indexeddb/storage-driver';
