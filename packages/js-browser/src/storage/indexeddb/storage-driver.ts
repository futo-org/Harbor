import type { IStorageDriver } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';
import { IndexedDBProcessIdRepository } from './process-id.repository';
import { IndexedDBEventAckRepository } from './event-ack.repository';
import { IndexedDBKeysRepository } from './keys.repository';
import { IndexedDBProcessStateRepository } from './process-state.repository';
import { IndexedDBEventRepository } from './event.repository';

export class IndexedDBStorageDriver implements IStorageDriver {
  private readonly database: IndexedDBDatabase;

  private constructor(databaseName: string) {
    const layout: IndexedDBDatabaseLayout = {
      version: 1,
      stores: [],
    };

    IndexedDBEventRepository.createNeededStores(layout);
    IndexedDBProcessStateRepository.createNeededStores(layout);
    IndexedDBKeysRepository.createNeededStores(layout);
    IndexedDBEventAckRepository.createNeededStores(layout);
    IndexedDBProcessIdRepository.createNeededStores(layout);

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
  createProcessStateRepository() {
    return new IndexedDBProcessStateRepository(this.database);
  }
  createKeysRepository() {
    return new IndexedDBKeysRepository(this.database);
  }
  createEventAckRepository() {
    return new IndexedDBEventAckRepository(this.database);
  }
  createProcessIdRepository() {
    return new IndexedDBProcessIdRepository(this.database);
  }
}
