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

// repositories implementations
export { BrowserSQLStorage } from './storage';

// storage
export type { StorageHandle, Repositories } from '@polycentric/js-core';
export { SqlStorageDriver } from './storage/opfs-sqlite/sql-storage-driver';

export {
  _createOPFSSQLiteDatabase,
  OPFSSQLiteDatabase,
} from './storage/opfs-sqlite/opfs-sqlite-database';

export {
  _createIndexedDBDatabase,
  IndexedDBDatabase,
} from './storage/indexeddb/database';
export { IndexedDBStorageDriver } from './storage/indexeddb/storage-driver';
