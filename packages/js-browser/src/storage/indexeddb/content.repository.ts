import type { IContentRepository } from '@polycentric/js-core';
import { DatabaseError } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';

export class IndexedDBContentRepository implements IContentRepository {
  private readonly database: IndexedDBDatabase;

  private static readonly STORE_NAME = 'content';

  static createNeededStores(layout: IndexedDBDatabaseLayout) {
    layout.stores.push({
      name: IndexedDBContentRepository.STORE_NAME,
      options: { keyPath: 'digestHex' },
      indexes: [],
    });
  }

  constructor(database: IndexedDBDatabase) {
    this.database = database;
  }

  private digestToHex(digest: Uint8Array): string {
    return Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async putContent(digest: Uint8Array, contentBytes: Uint8Array): Promise<void> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBContentRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBContentRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(
        store.put({ digestHex: this.digestToHex(digest), contentBytes }),
      );
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to persist content: ', error);
    }
  }

  async getContent(digest: Uint8Array): Promise<Uint8Array | null> {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBContentRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBContentRepository.STORE_NAME,
      );

      const result = await IndexedDBDatabase.requestAsPromise<{
        digestHex: string;
        contentBytes: Uint8Array;
      } | undefined>(store.get(this.digestToHex(digest)));

      return result?.contentBytes ?? null;
    } catch (error) {
      throw new DatabaseError('Failed to get content: ', error);
    }
  }
}
