import type { IStorageDriver } from '@polycentric/js-core';
import { IndexedDBDatabase, type IndexedDBDatabaseLayout } from './database';
import { IndexedDBEventAckRepository } from './event-ack.repository';
import { IndexedDBKeysRepository } from './keys.repository';
import { IndexedDBEventRepository } from './event.repository';
import { IndexedDBContentRepository } from './content.repository';

export class IndexedDBStorageDriver implements IStorageDriver {
  private readonly database: IndexedDBDatabase;

  private constructor(databaseName: string) {
    const layout: IndexedDBDatabaseLayout = {
      version: 3,
      stores: [],
    };

    IndexedDBEventRepository.createNeededStores(layout);
    IndexedDBContentRepository.createNeededStores(layout);
    IndexedDBKeysRepository.createNeededStores(layout);
    IndexedDBEventAckRepository.createNeededStores(layout);

    this.database = new IndexedDBDatabase(databaseName, layout);
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
  createKeysRepository() {
    return new IndexedDBKeysRepository(this.database);
  }
  createEventAckRepository() {
    return new IndexedDBEventAckRepository(this.database);
  }

  async saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null,
  ): Promise<void> {
    try {
      const key = IndexedDBStorageDriver.activeIdentityKey(publicKey);
      if (identityKey) {
        localStorage.setItem(key, identityKey);
      } else {
        localStorage.removeItem(key);
      }
    } catch {}
  }

  async loadActiveIdentityKey(publicKey: Uint8Array): Promise<string | null> {
    try {
      return localStorage.getItem(
        IndexedDBStorageDriver.activeIdentityKey(publicKey),
      );
    } catch {
      return null;
    }
  }

  private static activeIdentityKey(publicKey: Uint8Array): string {
    return `polycentric:activeIdentity:${IndexedDBStorageDriver.toHex(publicKey, 32)}`;
  }

  private static toHex(bytes: Uint8Array, len = 8): string {
    return Array.from(bytes.slice(0, len))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
