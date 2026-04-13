import type { IStorageDriver } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';
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
}
