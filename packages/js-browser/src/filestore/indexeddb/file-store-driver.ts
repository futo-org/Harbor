import { toDigestKey, type IFileStoreDriver, v2 } from '@polycentric/js-core';
import {
  IndexedDBDatabase,
  IndexedDBDatabaseLayout,
} from '../../datastore/indexeddb/database';

const STORE_NAME = 'blobs';

/**
 * IndexedDB-backed IFileStoreDriver. Lives in its own database (separate
 * from the datastore). Each blob is one entry keyed by `{type}_{hex}` to
 * match the CDN URL form.
 */
export class IndexedDBFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly database: IndexedDBDatabase) {}

  static async create(databaseName: string): Promise<IndexedDBFileStoreDriver> {
    const layout: IndexedDBDatabaseLayout = {
      version: 1,
      stores: [{ name: STORE_NAME, indexes: [] }],
    };
    const db = new IndexedDBDatabase(databaseName, layout);
    await db.initialize();
    return new IndexedDBFileStoreDriver(db);
  }

  private key(digest: v2.ContentDigest): string {
    return toDigestKey(digest);
  }

  async has(digest: v2.ContentDigest): Promise<boolean> {
    const tx = this.database.createTransaction(STORE_NAME, 'readonly');
    const count = await IndexedDBDatabase.requestAsPromise(
      tx.objectStore(STORE_NAME).count(this.key(digest)),
    );
    return count > 0;
  }

  async get(digest: v2.ContentDigest): Promise<Uint8Array | null> {
    const tx = this.database.createTransaction(STORE_NAME, 'readonly');
    const value = await IndexedDBDatabase.requestAsPromise<
      Uint8Array | undefined
    >(tx.objectStore(STORE_NAME).get(this.key(digest)));
    return value ?? null;
  }

  async put(digest: v2.ContentDigest, bytes: Uint8Array): Promise<void> {
    const tx = this.database.createTransaction(STORE_NAME, 'readwrite');
    await IndexedDBDatabase.requestAsPromise(
      tx.objectStore(STORE_NAME).put(bytes, this.key(digest)),
    );
  }

  async delete(digest: v2.ContentDigest): Promise<void> {
    const tx = this.database.createTransaction(STORE_NAME, 'readwrite');
    await IndexedDBDatabase.requestAsPromise(
      tx.objectStore(STORE_NAME).delete(this.key(digest)),
    );
  }
}
