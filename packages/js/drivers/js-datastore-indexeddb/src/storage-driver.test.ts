import { type EventRow, v2 as Proto } from '@polycentric/js-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBDatabase } from './database';
import { DATABASE_VERSION } from './migrations';
import { IndexedDBStorageDriver } from './storage-driver';

const DB_NAME = 'storage-driver-test';

const IDENTITY = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(32);

const publicKey = Proto.PublicKey.create({
  keyType: Proto.KeyType.ED25519,
  key: new Uint8Array(32).fill(1),
});

function makeRow(owner: string, sequence: bigint): EventRow {
  return {
    owner,
    eventKey: { collection: 1, identity: owner, signedBy: publicKey, sequence },
    eventBytes: new Uint8Array([1]),
    eventSignature: new Uint8Array([2]),
    contentStatus: 'absent',
  };
}

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

  describe('setActiveLogin', () => {
    it('clears the active login', async () => {
      const driver = await IndexedDBStorageDriver.create(DB_NAME);
      await driver.setActiveLogin({ identity: IDENTITY, publicKey });

      await driver.setActiveLogin(null);

      expect(await driver.getActiveLogin()).toBeNull();
      await driver.setActiveLogin({ identity: OTHER, publicKey });
      expect((await driver.getActiveLogin())?.identity).toBe(OTHER);
    });
  });

  describe('event repository deleteAll', () => {
    it('deletes only the events of that owner', async () => {
      const driver = await IndexedDBStorageDriver.create(DB_NAME);
      const events = driver.createEventRepository();
      await events.insert(makeRow(IDENTITY, 1n));
      await events.insert(makeRow(IDENTITY, 2n));
      await events.insert(makeRow(OTHER, 1n));

      await events.deleteAll(IDENTITY);

      expect(await events.getAll(IDENTITY)).toEqual([]);
      expect(await events.getAll(OTHER)).toHaveLength(1);
    });
  });
});
