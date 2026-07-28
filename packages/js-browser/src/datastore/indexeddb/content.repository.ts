import { type IContentRepository, v2 as Proto } from '@polycentric/js-core';

import { DatabaseError } from '@polycentric/js-core';
import { IndexedDBDatabase, type IndexedDBDatabaseLayout } from './database';

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

  async save(
    digest: Proto.ContentDigest,
    content: Proto.Content,
  ): Promise<void> {
    const digestBytes = Proto.ContentDigest.toBinary(digest);
    const contentBytes = Proto.Content.toBinary(content);

    try {
      const transaction = this.database.createTransaction(
        IndexedDBContentRepository.STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(
        IndexedDBContentRepository.STORE_NAME,
      );

      await IndexedDBDatabase.requestAsPromise(
        store.put({ digestHex: this.digestToHex(digestBytes), contentBytes }),
      );
      transaction.commit();
    } catch (error) {
      throw new DatabaseError('Failed to persist content: ', error);
    }
  }

  async get(digest: Proto.ContentDigest): Promise<Proto.Content | null> {
    const digestBytes = Proto.ContentDigest.toBinary(digest);

    try {
      const transaction = this.database.createTransaction(
        IndexedDBContentRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBContentRepository.STORE_NAME,
      );

      const result = await IndexedDBDatabase.requestAsPromise<
        | {
            digestHex: string;
            contentBytes: Uint8Array;
          }
        | undefined
      >(store.get(this.digestToHex(digestBytes)));

      return result ? Proto.Content.fromBinary(result.contentBytes) : null;
    } catch (error) {
      throw new DatabaseError('Failed to get content: ', error);
    }
  }

  async getAll(): Promise<
    { digest: Proto.ContentDigest; content: Proto.Content }[]
  > {
    try {
      const transaction = this.database.createTransaction(
        IndexedDBContentRepository.STORE_NAME,
        'readonly',
      );
      const store = transaction.objectStore(
        IndexedDBContentRepository.STORE_NAME,
      );

      const rows = await IndexedDBDatabase.requestAsPromise<
        { digestHex: string; contentBytes: Uint8Array }[]
      >(store.getAll());

      return rows.map((row) => {
        // digestHex encodes the full serialized ContentDigest proto.
        const digestBytes = new Uint8Array(
          row.digestHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
        );
        return {
          digest: Proto.ContentDigest.fromBinary(digestBytes),
          content: Proto.Content.fromBinary(row.contentBytes),
        };
      });
    } catch (error) {
      throw new DatabaseError('Failed to get all content: ', error);
    }
  }
}
