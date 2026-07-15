import type { IKeysRepository, PrivateKey } from '@polycentric/js-core';
import { v2, DatabaseError } from '@polycentric/js-core';
import { IndexedDBDatabase, type IndexedDBDatabaseLayout } from './database';

interface PersistedKey {
  key_type: number;
  private_key: Uint8Array;
  public_key: Uint8Array;
}

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

  async storeKeys(keys: {
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  }): Promise<void> {
    const keyType = keys.privateKey.keyType;
    const privateKey = keys.privateKey.key;
    const publicKey = keys.publicKey.key;

    if (
      !(keyType >= 0 && privateKey.length === 32 && publicKey.length === 32)
    ) {
      throw new DatabaseError('Invalid keys');
    }

    try {
      const keyToPersist: PersistedKey = {
        key_type: keyType,
        private_key: privateKey,
        public_key: publicKey,
      };

      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);

      await IndexedDBDatabase.requestAsPromise(store.put(keyToPersist));
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to store keys: ', error);
    }
  }

  async retrieveKeysByPublicKey(publicKey: v2.PublicKey): Promise<{
    privateKey: PrivateKey;
    publicKey: v2.PublicKey;
  } | null> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);

      const result = await IndexedDBDatabase.requestAsPromise<PersistedKey>(
        store.get(publicKey.key as IDBValidKey),
      );

      if (!result) {
        return null;
      }

      const kt = Number(result.key_type);
      return {
        privateKey: { keyType: kt, key: new Uint8Array(result.private_key) },
        publicKey: v2.PublicKey.create({
          keyType: kt,
          key: new Uint8Array(result.public_key),
        }),
      };
    } catch (error) {
      throw new DatabaseError('Failed to retrieve keys by public key: ', error);
    }
  }

  async removeKeys(publicKey: v2.PublicKey): Promise<void> {
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
      throw new DatabaseError('Failed to remove keys by public key: ', error);
    }
  }

  async getAllKeys(): Promise<
    {
      privateKey: PrivateKey;
      publicKey: v2.PublicKey;
    }[]
  > {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBKeysRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(IndexedDBKeysRepository.STORE_NAME);

      const results = await IndexedDBDatabase.requestAsPromise<PersistedKey[]>(
        store.getAll(),
      );

      return results.map((result) => {
        const kt = Number(result.key_type);
        return {
          privateKey: { keyType: kt, key: new Uint8Array(result.private_key) },
          publicKey: v2.PublicKey.create({
            keyType: kt,
            key: new Uint8Array(result.public_key),
          }),
        };
      });
    } catch (error) {
      throw new DatabaseError('Failed to retrieve all key pairs: ', error);
    }
  }
}
