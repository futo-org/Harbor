import type { IStorageDriver } from '@polycentric/js-core';
import { IndexedDBDatabase, IndexedDBDatabaseLayout } from './database';
import { IndexedDBEventAckRepository } from './event-ack.repository';
import { IndexedDBKeysRepository } from './keys.repository';
import { IndexedDBEventRepository } from './event.repository';
import { IndexedDBContentRepository } from './content.repository';
import { IndexedDBIdentityRepository } from './identity.repository';
import {
  createNeededStores as createMigrationStores,
  runMigrations,
} from './migrations';

export class IndexedDBStorageDriver implements IStorageDriver {
  private readonly database: IndexedDBDatabase;

  private constructor(databaseName: string) {
    const layout: IndexedDBDatabaseLayout = {
      version: 4,
      stores: [],
    };

    IndexedDBEventRepository.createNeededStores(layout);
    IndexedDBContentRepository.createNeededStores(layout);
    IndexedDBKeysRepository.createNeededStores(layout);
    IndexedDBEventAckRepository.createNeededStores(layout);
    IndexedDBIdentityRepository.createNeededStores(layout);
    createMigrationStores(layout);

    this.database = new IndexedDBDatabase(databaseName, layout);
  }

  static async create(databaseName: string): Promise<IndexedDBStorageDriver> {
    const driver = new IndexedDBStorageDriver(databaseName);
    await driver.database.initialize();
    await runMigrations(driver.database, driver);
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
  createIdentityRepository() {
    return new IndexedDBIdentityRepository(this.database);
  }
}
