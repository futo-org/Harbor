import type { IStorageDriver } from '@polycentric/js-core';
import { IndexedDBDatabase } from './database';
import { IndexedDBKeyRepository } from './key-repository';
import { IndexedDBEventRepository } from './event.repository';
import { IndexedDBContentRepository } from './content.repository';
import { activeIdentityKey } from './active-identity';

export class IndexedDBStorageDriver implements IStorageDriver {
  private readonly database: IndexedDBDatabase;

  private constructor(databaseName: string) {
    this.database = new IndexedDBDatabase(databaseName);
  }

  static async create(databaseName: string): Promise<IndexedDBStorageDriver> {
    const driver = new IndexedDBStorageDriver(databaseName);
    await driver.database.initialize();
    return driver;
  }

  createEventRepository() {
    return new IndexedDBEventRepository(this.database);
  }
  createContentRepository() {
    return new IndexedDBContentRepository(this.database);
  }
  createKeyRepository() {
    return new IndexedDBKeyRepository(this.database);
  }

  async saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null,
  ): Promise<void> {
    try {
      const key = activeIdentityKey(publicKey);
      if (identityKey) {
        localStorage.setItem(key, identityKey);
      } else {
        localStorage.removeItem(key);
      }
    } catch {}
  }

  async loadActiveIdentityKey(publicKey: Uint8Array): Promise<string | null> {
    try {
      return localStorage.getItem(activeIdentityKey(publicKey));
    } catch {
      return null;
    }
  }
}
