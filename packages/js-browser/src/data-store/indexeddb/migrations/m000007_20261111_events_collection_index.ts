import type { IndexedDBMigration } from './index';

/**
 * Indexes events by collection for use in `getProfiles()`.
 */
export const m000007_20261111_events_collection_index: IndexedDBMigration = {
  version: 7,
  async apply(transaction) {
    transaction
      .objectStore('events')
      .createIndex('idx_events_collection', 'eventKeyCollection');
  },
};
