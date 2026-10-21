import type { IndexedDBMigration } from './index';

// TODO: create event ack store here and delete it in the next migration
const STORES: { name: string; options: IDBObjectStoreParameters }[] = [
  {
    name: 'events',
    options: { keyPath: ['identity', 'publicKey', 'collection', 'sequence'] },
  },
  {
    name: 'content',
    options: { keyPath: 'digestHex' },
  },
  {
    name: 'keys',
    options: { keyPath: 'public_key' },
  },
];

/**
 * Initial schema, matching the layout used before migrations were introduced
 *
 * Pre-existing stores with the same name are dropped and recreated.
 */
export const m20261020_000001_initial: IndexedDBMigration = {
  version: 3,
  apply(transaction) {
    const db = transaction.db;
    for (const store of STORES) {
      if (db.objectStoreNames.contains(store.name)) {
        db.deleteObjectStore(store.name);
      }
      db.createObjectStore(store.name, store.options);
    }
  },
};
