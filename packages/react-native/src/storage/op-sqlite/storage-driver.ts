import type { IStorageDriver } from '@polycentric/js-core';
import { Database } from './database';
import { EventRepository } from './event.repository';
import { ContentRepository } from './content.repository';
import { KeysRepository } from './keys.repository';
import { EventAckRepository } from './event-ack.repository';

export class ReactNativeStorageDriver implements IStorageDriver {
  private constructor(private readonly database: Database) {}

  static async create(databaseName: string): Promise<ReactNativeStorageDriver> {
    const database = new Database(databaseName);
    await database.open();
    return new ReactNativeStorageDriver(database);
  }

  createEventRepository() {
    return new EventRepository();
  }

  createContentRepository() {
    return new ContentRepository();
  }

  createKeysRepository() {
    return new KeysRepository(this.database);
  }

  createEventAckRepository() {
    return new EventAckRepository(this.database);
  }
}
