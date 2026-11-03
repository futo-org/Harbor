import type { IndexedDBMigration } from './index';

const STORES: {
  name: string;
  options: IDBObjectStoreParameters;
  indexes: {
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }[];
}[] = [
  {
    name: 'events',
    options: { keyPath: ['identity', 'publicKey', 'collection', 'sequence'] },
    indexes: [],
  },
  {
    name: 'content',
    options: { keyPath: 'digestHex' },
    indexes: [],
  },
  {
    name: 'keys',
    options: { keyPath: 'public_key' },
    indexes: [],
  },
  {
    name: 'event_acks',
    options: { keyPath: 'id', autoIncrement: true },
    indexes: [
      {
        name: 'idx_event_acks_natural_key',
        keyPath: ['system_key_type', 'system_key', 'process', 'sequence'],
      },
      {
        name: 'idx_event_acks_server_has_ack',
        keyPath: [
          'system_key_type',
          'system_key',
          'process',
          'sequence',
          'servers',
        ],
      },
    ],
  },
];

/**
 * The schema specified by the "layout" system used before, but as a migration.
 * Pre-existing stores with the same name are dropped and recreated.
 */
export const m000003_20261020_initial: IndexedDBMigration = {
  version: 3,
  async apply(transaction) {
    const db = transaction.db;

    for (const store of STORES) {
      // Delete any existing store by this name.
      if (db.objectStoreNames.contains(store.name)) {
        db.deleteObjectStore(store.name);
      }

      // Create the store
      const objectStore = db.createObjectStore(store.name, store.options);

      // Create any indexes
      for (const index of store.indexes) {
        objectStore.createIndex(index.name, index.keyPath, index.options);
      }
    }
  },
};
