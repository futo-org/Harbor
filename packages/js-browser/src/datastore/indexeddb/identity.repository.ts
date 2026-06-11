import type { IIdentityRepository, IdentityRecord } from '@polycentric/js-core';
import { v2, DatabaseError } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';

/**
 * IndexedDB-based IIdentityRepository: the per-identity records of the public
 * keys this client holds for each identity it participates in.
 */
export class IndexedDBIdentityRepository implements IIdentityRepository {
  private static readonly RECORDS_STORE = 'identity_records';

  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBIdentityRepository.RECORDS_STORE,
      options: { keyPath: 'identityKey' },
      indexes: [],
    });
  }

  constructor(private readonly database: IndexedDBDatabase) {}

  async getRecord(identityKey: string): Promise<IdentityRecord | null> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBIdentityRepository.RECORDS_STORE,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBIdentityRepository.RECORDS_STORE,
      );
      const row = await IndexedDBDatabase.requestAsPromise<IdentityRecord>(
        store.get(identityKey),
      );
      return row ? normalize(row) : null;
    } catch (error) {
      throw new DatabaseError('Failed to read identity record: ', error);
    }
  }

  async saveRecord(record: IdentityRecord): Promise<void> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBIdentityRepository.RECORDS_STORE,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBIdentityRepository.RECORDS_STORE,
      );
      await IndexedDBDatabase.requestAsPromise(store.put(record));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to write identity record: ', error);
    }
  }

  async getAllRecords(): Promise<IdentityRecord[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBIdentityRepository.RECORDS_STORE,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBIdentityRepository.RECORDS_STORE,
      );
      const rows = await IndexedDBDatabase.requestAsPromise<IdentityRecord[]>(
        store.getAll(),
      );
      return rows.map(normalize);
    } catch (error) {
      throw new DatabaseError('Failed to read identity records: ', error);
    }
  }
}

/**
 * Rebuild the heldKeys as PublicKey instances. Structured clone stores them as
 * plain `{ keyType, key }` objects; downstream code expects PublicKey.
 */
function normalize(record: IdentityRecord): IdentityRecord {
  return {
    ...record,
    heldKeys: record.heldKeys.map((k) =>
      v2.PublicKey.create({ keyType: k.keyType, key: k.key }),
    ),
  };
}
