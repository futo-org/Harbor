import type { IndexedDBMigration } from './index';

export const m000004_20261021_drop_event_acks: IndexedDBMigration = {
  version: 4,
  apply(transaction) {
    const db = transaction.db;
    if (db.objectStoreNames.contains('event_acks')) {
      db.deleteObjectStore('event_acks');
    }
  },
};
