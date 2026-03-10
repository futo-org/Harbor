// wasm bridge
export { NodeWasmBridge, __killWasmInstance } from './wasm-bridge';

export type { PolycentricWasm } from '@polycentric/rs-core-wasm-node';

// database adapters
export {
  _createNodeSQLiteDatabase,
  NodeSQLiteDatabase,
} from './storage/sqlite/sqlite-database';

// crypto implementations
export { ED25519KeyManager } from './crypto/ed25519-key-manager';
export { NodeCryptoManager } from './crypto/node-crypto-manager';

// repositories implementations
export { NodeSQLStorage } from './storage';

// storage
export type { StorageHandle, Repositories } from '@polycentric/js-core';
export { SqlStorageDriver } from './storage/sqlite/sql-storage-driver';
