import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBDatabase } from './database';
import { DATABASE_VERSION } from './migrations';
import { IndexedDBStorageDriver } from './storage-driver';

const DB_NAME = 'storage-driver-test';

describe('IndexedDBStorageDriver', () => {
  // Ensure the database is not present first
  beforeEach(async () => {
    await IndexedDBDatabase.deleteDatabase(DB_NAME);
  });

  describe('create', () => {
    it('migrates a new database to the current version', async () => {
      await IndexedDBStorageDriver.create(DB_NAME);

      const databases = await indexedDB.databases();
      const database = databases.find((db) => db.name === DB_NAME);
      expect(database?.version).toBe(DATABASE_VERSION);
    });
  });
});
