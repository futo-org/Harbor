import type { IStorageDriver } from '@polycentric/js-core';
import { Database } from './database';
import { EventRepository } from './event.repository';
import { KeysRepository } from './keys.repository';
import { ProcessStateRepository } from './process-state.repository';
import { ProcessIdRepository } from './process-id.repository';
import { EventAckRepository } from './event-ack.repository';

export class ReactNativeStorageDriver implements IStorageDriver {
  private constructor(private readonly database: Database) {}

  static async create(databaseName: string): Promise<ReactNativeStorageDriver> {
    const database = new Database(databaseName);
    await database.open();
    return new ReactNativeStorageDriver(database);
  }

  createEventRepository() {
    return new EventRepository(this.database);
  }

  createProcessStateRepository() {
    return new ProcessStateRepository(this.database);
  }

  createKeysRepository() {
    return new KeysRepository(this.database);
  }

  createEventAckRepository() {
    return new EventAckRepository(this.database);
  }

  createProcessIdRepository() {
    return new ProcessIdRepository(this.database);
  }
}
