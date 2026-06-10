import type { IKeysRepository, PersistedKey } from '@polycentric/js-core';
import { v2, DatabaseError } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';

/**
 * IndexedDBKeysRepository provides IndexedDB-based storage for cryptographic keys.
 */
export class IndexedDBKeysRepository implements IKeysRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'keys';

  /**
   * Adds the stores that this repository needs to an IndexedDBDatabaseLayout object
   */
  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBKeysRepository.STORE_NAME,
      options: {
        keyPath: 'public_key',
      },
      indexes: [],
    });
  }

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  async getAllKeys(): Promise<PersistedKey[]> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);
      const results = await IndexedDBDatabase.requestAsPromise<PersistedKey[]>(
        store.getAll(),
      );
      return results;
    } catch (error) {
      throw new DatabaseError('Failed to retrieve all key pairs: ', error);
    }
  }

  async get(publicKey: v2.PublicKey): Promise<PersistedKey | null> {
    const row = await this.read(publicKey);
    if (!row) return null;
    return row;
  }

  async insert(row: PersistedKey): Promise<void> {
    await this.write(row);
  }

  async delete(publicKey: v2.PublicKey): Promise<void> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);
      await IndexedDBDatabase.requestAsPromise(
        store.delete(publicKey.key as IDBValidKey),
      );
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to delete key: ', error);
    }
  }

  private async read(publicKey: v2.PublicKey): Promise<PersistedKey | null> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);
      const result = await IndexedDBDatabase.requestAsPromise<PersistedKey>(
        store.get(publicKey.key as IDBValidKey),
      );
      return result ?? null;
    } catch (error) {
      throw new DatabaseError('Failed to read key: ', error);
    }
  }

  private async write(row: PersistedKey): Promise<void> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);
      await IndexedDBDatabase.requestAsPromise(store.put(row));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to write key: ', error);
    }
  }
}
