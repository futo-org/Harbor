// crypto implementations
export { ED25519KeyManager } from './crypto/ed25519-key-manager';
export { BrowserCryptoManager } from './crypto/browser-crypto-manager';

// storage
export type { StorageHandle, Repositories } from '@polycentric/js-core';

export {
  _createIndexedDBDatabase,
  IndexedDBDatabase,
} from './datastore/indexeddb/database';
export { IndexedDBStorageDriver } from './datastore/indexeddb/storage-driver';
export { OpfsFileStoreDriver } from './filestore/opfs/file-store-driver';
